import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDesktop, type RunningDesktop } from "../src/start-desktop";

describe("startDesktop", () => {
  let dir: string | undefined;
  let blocker: Server | undefined;
  let desktop: RunningDesktop | undefined;

  afterEach(async () => {
    await desktop?.close();
    await new Promise<void>((resolve) => (blocker ? blocker.close(() => resolve()) : resolve()));
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("falls back to the next port when the configured one is busy and serves the API there", async () => {
    dir = await mkdtemp(join(tmpdir(), "speak-bot-start-"));
    blocker = createServer();
    await new Promise<void>((resolve) => blocker!.listen(0, "127.0.0.1", resolve));
    const busyPort = (blocker.address() as AddressInfo).port;
    const messages: string[] = [];

    desktop = await startDesktop({
      argv: ["--port", String(busyPort), "--host", "127.0.0.1", "--data-dir", dir],
      env: {},
      log: (message) => messages.push(message),
    });

    expect(desktop.port).toBeGreaterThan(busyPort);
    expect(desktop.overlayUrl).toBe(`http://localhost:${desktop.port}/overlay`);
    expect(messages).toContain(`Port ${busyPort} is busy; using ${desktop.port} instead.`);
    const response = await fetch(`http://127.0.0.1:${desktop.port}/api/health`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
  });
});
