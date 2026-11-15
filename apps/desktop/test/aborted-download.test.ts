import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPageHandler } from "../src/server/static-files";

describe("a download the client abandons", () => {
  let dir: string;
  let server: Server;
  let port: number;
  let finished = 0;
  const uncaught: string[] = [];
  const record = (error: Error) => uncaught.push(error.message);

  beforeEach(async () => {
    finished = 0;
    uncaught.length = 0;
    process.on("uncaughtException", record);
    dir = await mkdtemp(join(tmpdir(), "speed-deck-abort-"));
    await mkdir(join(dir, "dist", "assets"), { recursive: true });
    await writeFile(join(dir, "dist", "index.html"), "<!doctype html>");
    // Far larger than the socket buffers, so the transfer is still running when the client leaves.
    await writeFile(join(dir, "dist", "assets", "big.js"), Buffer.alloc(24 * 1024 * 1024, "a"));
    const handle = createPageHandler({ mobileDistDir: join(dir, "dist"), overlayFile: join(dir, "overlay.html") });
    server = createServer((request, response) => {
      void handle(request, response, new URL(request.url ?? "/", "http://x").pathname).then(() => (finished += 1));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    process.off("uncaughtException", record);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  it("ends the request instead of holding the file open forever, and raises nothing", async () => {
    await new Promise<void>((resolve) => {
      const socket = connect(port, "127.0.0.1", () => socket.write("GET /assets/big.js HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"));
      // Leaves as soon as the first bytes arrive, with most of the file still to come.
      socket.once("data", () => {
        socket.resetAndDestroy();
        resolve();
      });
      socket.on("error", () => resolve());
    });
    const deadline = Date.now() + 2000;
    while (finished === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finished).toBe(1);
    expect(uncaught).toEqual([]);
  });
});
