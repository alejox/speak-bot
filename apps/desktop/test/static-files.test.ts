import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPageHandler, resolveSafePath } from "../src/server/static-files";

describe("resolveSafePath", () => {
  it("resolves paths inside the root (POSIX)", () => {
    expect(resolveSafePath("/srv/app", "/assets/app.js", posix)).toBe("/srv/app/assets/app.js");
    expect(resolveSafePath("/srv/app", "/", posix)).toBe("/srv/app");
  });

  it("rejects traversal and invalid paths (POSIX)", () => {
    for (const attempt of ["/../secret", "/assets/../../secret", "/%2e%2e/secret", "/a%00b", "/%E0%A4%A"]) {
      expect(resolveSafePath("/srv/app", attempt, posix), attempt).toBeNull();
    }
  });

  it("rejects backslash traversal and drive letters (Windows)", () => {
    const root = "C:\\srv\\app";
    expect(resolveSafePath(root, "/assets/app.js", win32)).toBe("C:\\srv\\app\\assets\\app.js");
    for (const attempt of ["/..\\..\\Windows\\win.ini", "/%5c..%5c..%5csecret", "/C:/Windows/win.ini", "/D:secret"]) {
      expect(resolveSafePath(root, attempt, win32), attempt).toBeNull();
    }
  });
});

describe("page handler", () => {
  let dir: string;
  let server: Server;
  let baseUrl: string;

  async function start(mobileDistDir: string) {
    const overlayFile = join(dir, "overlay.html");
    await writeFile(overlayFile, "<!doctype html><title>Overlay</title>", "utf8");
    const handle = createPageHandler({ mobileDistDir, overlayFile });
    server = createServer((request, response) => {
      const pathname = new URL(request.url ?? "/", "http://x").pathname;
      void handle(request, response, pathname).then((handled) => {
        if (!handled) response.writeHead(404).end("unhandled");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speak-bot-static-"));
    await mkdir(join(dir, "dist", "assets"), { recursive: true });
    await writeFile(join(dir, "dist", "index.html"), "<!doctype html><title>Speak Bot</title>", "utf8");
    await writeFile(join(dir, "dist", "assets", "app.js"), "console.log('app')", "utf8");
    await writeFile(join(dir, "secret.txt"), "top secret", "utf8");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  it("serves index.html at / and static assets with content types", async () => {
    await start(join(dir, "dist"));

    const index = await fetch(`${baseUrl}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toMatch(/text\/html/);
    expect(await index.text()).toContain("Speak Bot");

    const asset = await fetch(`${baseUrl}/assets/app.js`);
    expect(asset.headers.get("content-type")).toMatch(/javascript/);
    expect(await asset.text()).toBe("console.log('app')");
  });

  it("falls back to index.html for app routes but 404s for missing files", async () => {
    await start(join(dir, "dist"));

    expect(await (await fetch(`${baseUrl}/settings`)).text()).toContain("Speak Bot");
    expect((await fetch(`${baseUrl}/assets/missing.js`)).status).toBe(404);
  });

  it("never serves files outside the build directory", async () => {
    await start(join(dir, "dist"));

    for (const attempt of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/..%5csecret.txt"]) {
      const response = await fetch(`${baseUrl}${attempt}`);
      expect(await response.text(), attempt).not.toContain("top secret");
    }
  });

  it("serves the overlay page", async () => {
    await start(join(dir, "dist"));

    for (const path of ["/overlay", "/overlay/"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/text\/html/);
      expect(await response.text()).toContain("Overlay");
    }
  });

  it("explains how to build the app when the build is missing", async () => {
    await start(join(dir, "missing-dist"));

    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("npm run build -w apps/mobile");
    expect((await fetch(`${baseUrl}/overlay`)).status).toBe(200);
  });
});
