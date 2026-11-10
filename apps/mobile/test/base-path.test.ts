// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBase } from "../vite.config";

describe("resolveBase", () => {
  it("serves from the root unless told otherwise (the desktop app)", () => {
    expect(resolveBase(undefined)).toBe("/");
    expect(resolveBase("")).toBe("/");
  });

  it("normalizes a sub-path such as GitHub Pages' /speak-bot/", () => {
    expect(resolveBase("/speak-bot/")).toBe("/speak-bot/");
    expect(resolveBase("speak-bot")).toBe("/speak-bot/");
  });
});

describe("build under /speak-bot/", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "speak-bot-pages-"));
    process.env.SPEAK_BOT_BASE = "/speak-bot/";
    try {
      await build({ root, configFile: join(root, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
    } finally {
      delete process.env.SPEAK_BOT_BASE;
    }
  }, 60_000);

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("points every asset, the icon and the service worker at /speak-bot/", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toMatch(/src="\/speak-bot\/assets\/[^"]+\.js"/);
    expect(html).toContain('href="/speak-bot/icon.svg"');
    expect(html).toContain('href="/speak-bot/manifest.webmanifest"');
    expect(html).not.toMatch(/(src|href)="\/(assets|icon\.svg|manifest)/);

    const register = await readFile(join(outDir, "registerSW.js"), "utf8");
    expect(register).toContain("/speak-bot/sw.js");
    expect(register).toContain("scope: '/speak-bot/'");
  });

  it("starts the installed app at /speak-bot/", async () => {
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.webmanifest"), "utf8")) as Record<string, unknown>;
    expect(manifest.start_url).toBe("/speak-bot/");
    expect(manifest.scope).toBe("/speak-bot/");
  });
});
