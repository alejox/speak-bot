import { DEFAULT_PHRASES_BY_LANGUAGE, type Board } from "@speed-deck/core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDesktop, type RunningDesktop } from "../src/start-desktop";
import { FakeAdvertiser } from "./discovery/fake-advertiser";
import { FakeObsClient, obsResponses } from "./fake-obs-client";

/** No sponsor feed and no license store, so starting the desktop in a test never reaches the network. */
const OFFLINE_ENV = { SPEED_DECK_AD_FEED_URL: "", SPEED_DECK_LEMON_SQUEEZY_STORE_ID: "", SPEED_DECK_LEMON_SQUEEZY_PRODUCT_ID: "", SPEED_DECK_CHECKOUT_URL: "" };

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
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    blocker = createServer();
    await new Promise<void>((resolve) => blocker!.listen(0, "127.0.0.1", resolve));
    const busyPort = (blocker.address() as AddressInfo).port;
    const messages: string[] = [];

    desktop = await startDesktop({
      argv: ["--port", String(busyPort), "--host", "127.0.0.1", "--data-dir", dir],
      env: OFFLINE_ENV,
      log: (message) => messages.push(message),
    });

    expect(desktop.port).toBeGreaterThan(busyPort);
    expect(desktop.overlayUrl).toBe(`http://localhost:${desktop.port}/overlay`);
    expect(desktop.dockUrl).toBe(`http://127.0.0.1:${desktop.port}/dock`);
    expect(messages).toContain(`Port ${busyPort} is busy; using ${desktop.port} instead.`);
    const response = await fetch(`http://127.0.0.1:${desktop.port}/api/health`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("skips a port another app holds on 127.0.0.1 even when the wildcard bind succeeds", async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    // On macOS binding 0.0.0.0 succeeds next to this server; on Linux/Windows it fails with EADDRINUSE.
    blocker = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("another app");
    });
    await new Promise<void>((resolve) => blocker!.listen(0, "127.0.0.1", resolve));
    const busyPort = (blocker.address() as AddressInfo).port;

    desktop = await startDesktop({
      argv: ["--port", String(busyPort), "--host", "0.0.0.0", "--data-dir", dir],
      env: OFFLINE_ENV,
      advertiser: new FakeAdvertiser(),
    });

    expect(desktop.port).not.toBe(busyPort);
    const response = await fetch(`http://127.0.0.1:${desktop.port}/api/health`);
    expect(((await response.json()) as { instanceId?: string }).instanceId).toBe(desktop.instanceId);
  });

  it("creates the Spanish communication board on first run by default", async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    desktop = await startDesktop({ argv: ["--port", "0", "--host", "127.0.0.1", "--data-dir", dir], env: OFFLINE_ENV });

    expect(await phraseTexts(desktop.port)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.es]);
    expect((await desktop.loadSettings()).language).toBe("es");
  });

  it("creates the board in the language saved in the settings and reports settings changes", async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    await writeFile(join(dir, "settings.json"), JSON.stringify({ language: "en" }));
    desktop = await startDesktop({ argv: ["--port", "0", "--host", "127.0.0.1", "--data-dir", dir], env: OFFLINE_ENV });
    const changes: string[] = [];
    desktop.onSettingsChanged((settings) => changes.push(settings.language));

    expect(await phraseTexts(desktop.port)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.en]);

    await fetch(`http://127.0.0.1:${desktop.port}/api/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: "es" }),
    });
    expect(changes).toEqual(["es"]);
  });

  it("announces itself on the LAN with a stable id while it runs", async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    const advertiser = new FakeAdvertiser();
    desktop = await startDesktop({
      argv: ["--port", "0", "--host", "0.0.0.0", "--data-dir", dir],
      env: OFFLINE_ENV,
      advertiser,
      computerName: "Studio Mac",
    });

    expect(advertiser.advertised).toHaveLength(1);
    const announcement = advertiser.advertised[0]!;
    expect(announcement).toMatchObject({ type: "speeddeck", port: desktop.port, txt: { id: desktop.desktopId, name: "Studio Mac", v: "1" } });
    const health = (await (await fetch(`http://127.0.0.1:${desktop.port}/api/health`)).json()) as { desktopId?: string };
    expect(health.desktopId).toBe(desktop.desktopId);

    await desktop.close();
    expect(advertiser.stopped).toEqual([announcement]);

    // The id survives a restart, so the phone recognises the same computer at a new address.
    const restarted = new FakeAdvertiser();
    desktop = await startDesktop({ argv: ["--port", "0", "--host", "0.0.0.0", "--data-dir", dir], env: OFFLINE_ENV, advertiser: restarted });
    expect(restarted.advertised[0]!.txt.id).toBe(announcement.txt.id);
  });

  it("does not announce itself when it only listens on one address", async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    const advertiser = new FakeAdvertiser();
    desktop = await startDesktop({ argv: ["--port", "0", "--host", "127.0.0.1", "--data-dir", dir], env: OFFLINE_ENV, advertiser });

    expect(advertiser.advertised).toEqual([]);
  });

  it("connects to OBS on start when enabled, without ever sending the password to clients", async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-start-"));
    await writeFile(join(dir, "settings.json"), JSON.stringify({ obs: { enabled: true, host: "127.0.0.1", port: 4455, password: "hunter2-obs" } }));
    FakeObsClient.created = [];
    desktop = await startDesktop({
      argv: ["--port", "0", "--host", "127.0.0.1", "--data-dir", dir],
      env: OFFLINE_ENV,
      createObsClient: () => new FakeObsClient(null, obsResponses()),
    });

    for (let i = 0; i < 50 && FakeObsClient.created.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(FakeObsClient.created[0]!.connects).toEqual([{ url: "ws://127.0.0.1:4455", password: "hunter2-obs" }]);
    const settings = await (await fetch(`http://127.0.0.1:${desktop.port}/api/settings`)).text();
    expect(settings).not.toContain("hunter2-obs");
    expect(JSON.parse(settings)).toMatchObject({ obs: { enabled: true, hasPassword: true } });
    expect(JSON.stringify(await desktop.loadSettings())).not.toContain("hunter2-obs");
  });
});

/** Texts of the speak keys on the first board, in slot order. */
async function phraseTexts(port: number): Promise<string[]> {
  const boards = (await (await fetch(`http://127.0.0.1:${port}/api/boards`)).json()) as Board[];
  return boards[0]!.keys.flatMap((key) => (key.action.type === "voice.speak" ? [key.action.text] : []));
}
