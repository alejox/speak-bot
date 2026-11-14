import type { AppUpdater, AppUpdateState, ServerEvent } from "@speed-deck/core";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createApiHandler } from "../src/server/api";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";
import { startDesktop, type RunningDesktop } from "../src/start-desktop";
import { FakeSynthesizer } from "./fake-synthesizer";

const IDLE: AppUpdateState = { currentVersion: "1.2.0", mode: "auto", status: "idle", autoCheck: true };
const DOWNLOADED: AppUpdateState = { ...IDLE, status: "downloaded", latestVersion: "1.3.0", lastCheckedAt: 5 };
const LAN = "192.168.1.30";
const LOOPBACK = "127.0.0.1";

/** The Electron app's updater as the server sees it. */
class FakeAppUpdater implements AppUpdater {
  current: AppUpdateState = IDLE;
  checks = 0;
  installs = 0;
  autoCheckCalls: boolean[] = [];
  private readonly listeners = new Set<(state: AppUpdateState) => void>();

  state(): AppUpdateState {
    return this.current;
  }

  subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  set(next: AppUpdateState): void {
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }

  async check(): Promise<AppUpdateState> {
    this.checks += 1;
    this.set({ ...this.current, status: "up-to-date", lastCheckedAt: 9 });
    return this.current;
  }

  install(): boolean {
    if (this.current.status !== "downloaded") return false;
    this.installs += 1;
    return true;
  }

  setAutoCheck(enabled: boolean): void {
    this.autoCheckCalls.push(enabled);
    this.set({ ...this.current, autoCheck: enabled });
  }
}

describe("app update API", () => {
  let dir: string;
  let updater: FakeAppUpdater;
  let settings: JsonFileSettingsStore;
  let events: ServerEvent[];
  let handle: ReturnType<typeof createApiHandler>;

  const createHandler = (appUpdater: AppUpdater | undefined) =>
    createApiHandler({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings,
      synthesizer: new FakeSynthesizer(),
      broadcast: (event) => events.push(event),
      generateId: () => "id",
      now: () => 1,
      instanceId: "test",
      appUpdater,
    });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-update-api-"));
    settings = new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true });
    updater = new FakeAppUpdater();
    events = [];
    handle = createHandler(updater);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Sends a request through the API handler as if it came from `remoteAddress`. */
  const ask = async (remoteAddress: string, method: string, path: string, body?: unknown) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const request = Object.assign(Readable.from(payload === "" ? [] : [Buffer.from(payload)]), {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) },
      socket: { remoteAddress, localPort: 4545 },
    }) as unknown as IncomingMessage;
    let status = 0;
    let text = "";
    const response = {
      headersSent: false,
      writeHead: (code: number) => {
        status = code;
      },
      end: (chunk?: string) => {
        text = chunk ?? "";
      },
    } as unknown as ServerResponse;
    await handle(request, response, path);
    return { status, body: text === "" ? undefined : (JSON.parse(text) as Record<string, unknown>) };
  };

  it("tells any admitted client the version and update state, so a paired phone can show them", async () => {
    updater.current = DOWNLOADED;
    for (const remoteAddress of [LOOPBACK, LAN, "::ffff:192.168.1.30"]) {
      expect(await ask(remoteAddress, "GET", "/api/app-update")).toEqual({ status: 200, body: { update: DOWNLOADED } });
    }
  });

  it("checks now on this computer and answers with the state after the check", async () => {
    const result = await ask(LOOPBACK, "POST", "/api/app-update/check", {});
    expect(result).toEqual({ status: 200, body: { update: { ...IDLE, status: "up-to-date", lastCheckedAt: 9 } } });
    expect(updater.checks).toBe(1);
  });

  it("restarts to install a downloaded update on this computer", async () => {
    updater.current = DOWNLOADED;
    expect(await ask(LOOPBACK, "POST", "/api/app-update/install", {})).toEqual({ status: 200, body: { update: DOWNLOADED } });
    expect(updater.installs).toBe(1);
  });

  it("refuses to install while nothing is downloaded", async () => {
    const result = await ask(LOOPBACK, "POST", "/api/app-update/install", {});
    expect(result).toMatchObject({ status: 409, body: { code: "update-not-ready" } });
    expect(updater.installs).toBe(0);
  });

  it("only lets this computer check, install or change the automatic checks", async () => {
    updater.current = DOWNLOADED;
    for (const remoteAddress of [LAN, "::ffff:192.168.1.30", "fe80::1"]) {
      expect(await ask(remoteAddress, "POST", "/api/app-update/check", {})).toMatchObject({ status: 403, body: { code: "loopback-only" } });
      expect(await ask(remoteAddress, "POST", "/api/app-update/install", {})).toMatchObject({ status: 403, body: { code: "loopback-only" } });
      expect(await ask(remoteAddress, "PUT", "/api/settings", { autoCheckUpdates: false })).toMatchObject({ status: 403, body: { code: "loopback-only" } });
    }
    expect(updater.checks).toBe(0);
    expect(updater.installs).toBe(0);
    expect(updater.autoCheckCalls).toEqual([]);
    expect((await settings.load()).autoCheckUpdates).toBeUndefined();
    // Other settings stay open to paired phones.
    expect((await ask(LAN, "PUT", "/api/settings", { rate: 1.5 })).status).toBe(200);
  });

  it("requires a JSON body for the actions, so a plain cross-site form cannot trigger them", async () => {
    expect((await ask(LOOPBACK, "POST", "/api/app-update/check")).status).toBe(415);
    expect((await ask(LOOPBACK, "POST", "/api/app-update/install")).status).toBe(415);
    expect(updater.checks).toBe(0);
  });

  it("saves the automatic checks setting with the other settings and tells the updater", async () => {
    // Not stored until chosen: the app checks by itself by default.
    expect((await ask(LOOPBACK, "GET", "/api/settings")).body).not.toHaveProperty("autoCheckUpdates");

    const off = await ask(LOOPBACK, "PUT", "/api/settings", { autoCheckUpdates: false });
    expect(off).toMatchObject({ status: 200, body: { autoCheckUpdates: false } });
    expect(updater.autoCheckCalls).toEqual([false]);
    expect((await settings.load()).autoCheckUpdates).toBe(false);
    expect(events.some((event) => event.type === "settings-changed" && event.settings.autoCheckUpdates === false)).toBe(true);

    await ask(LOOPBACK, "PUT", "/api/settings", { autoCheckUpdates: true });
    expect(updater.autoCheckCalls).toEqual([false, true]);
    expect((await ask(LOOPBACK, "GET", "/api/app-update")).body).toMatchObject({ update: { autoCheck: true } });

    // A change to something else does not touch the updater.
    await ask(LOOPBACK, "PUT", "/api/settings", { rate: 1.2 });
    expect(updater.autoCheckCalls).toEqual([false, true]);
    expect((await settings.load()).autoCheckUpdates).toBe(true);
  });

  it("rejects a value that is not true or false", async () => {
    expect((await ask(LOOPBACK, "PUT", "/api/settings", { autoCheckUpdates: "no" })).status).toBe(400);
    expect(updater.autoCheckCalls).toEqual([]);
  });

  describe("without the computer app (npm start)", () => {
    beforeEach(() => {
      handle = createHandler(undefined);
    });

    it("answers that there is no update state, and has nothing to check or install", async () => {
      expect(await ask(LAN, "GET", "/api/app-update")).toEqual({ status: 200, body: { update: null } });
      expect(await ask(LOOPBACK, "POST", "/api/app-update/check", {})).toMatchObject({ status: 409, body: { code: "update-unavailable" } });
      expect(await ask(LOOPBACK, "POST", "/api/app-update/install", {})).toMatchObject({ status: 409, body: { code: "update-unavailable" } });
    });

    it("still saves the setting for when the app runs", async () => {
      expect(await ask(LOOPBACK, "PUT", "/api/settings", { autoCheckUpdates: false })).toMatchObject({ status: 200, body: { autoCheckUpdates: false } });
    });
  });
});

describe("app update events", () => {
  let dir: string;
  let server: DesktopServer | undefined;
  let desktop: RunningDesktop | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-update-events-"));
  });

  afterEach(async () => {
    await server?.close();
    await desktop?.close();
    server = undefined;
    desktop = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("broadcasts every state change as an app-update event and stops listening when the server closes", async () => {
    const updater = new FakeAppUpdater();
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 42,
      appUpdater: updater,
    });
    await server.listen(0, "127.0.0.1");
    const socket = new WebSocket(`ws://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}/ws`);
    const received: ServerEvent[] = [];
    socket.on("message", (data) => received.push(JSON.parse(String(data)) as ServerEvent));
    await new Promise((resolve) => socket.once("open", resolve));

    updater.set({ ...IDLE, status: "checking" });
    updater.set(DOWNLOADED);
    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.close();

    expect(received.filter((event) => event.type === "app-update")).toEqual([
      { type: "app-update", update: { ...IDLE, status: "checking" }, at: 42 },
      { type: "app-update", update: DOWNLOADED, at: 42 },
    ]);

    await server.close();
    server = undefined;
    expect(updater.listenerCount).toBe(0);
  });

  it("gives the app's updater the saved setting at startup and serves its state", async () => {
    const start = (appUpdater: AppUpdater) =>
      startDesktop({ argv: ["--port", "0", "--host", "127.0.0.1", "--data-dir", dir], env: { SPEED_DECK_AD_FEED_URL: "" }, appUpdater });
    const first = new FakeAppUpdater();
    desktop = await start(first);
    // Nothing chosen yet: the updater keeps its default.
    expect(first.autoCheckCalls).toEqual([]);
    const url = `http://127.0.0.1:${desktop.port}`;
    expect(await (await fetch(`${url}/api/app-update`)).json()).toEqual({ update: IDLE });
    const saved = await fetch(`${url}/api/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ autoCheckUpdates: false }) });
    expect(saved.status).toBe(200);
    await desktop.close();

    const second = new FakeAppUpdater();
    desktop = await start(second);
    expect(second.autoCheckCalls).toEqual([false]);
  });
});
