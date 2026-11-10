import type { ServerEvent } from "@speed-deck/core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFileBoardRepository } from "../../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../../src/adapters/json-file-settings-store";
import { ObsConnectionManager } from "../../src/adapters/obs/obs-connection-manager";
import { createApiHandler } from "../../src/server/api";
import { createDesktopServer, type DesktopServer } from "../../src/server/create-server";
import { FakeObsClient, obsResponses } from "../fake-obs-client";
import { FakeSynthesizer } from "../fake-synthesizer";

const PASSWORD = "very-secret-obs-password";

describe("OBS API", () => {
  let dir: string;
  let server: DesktopServer;
  let baseUrl: string;
  let obs: ObsConnectionManager;
  let logs: string[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-obs-api-"));
    FakeObsClient.created = [];
    logs = [];
    obs = new ObsConnectionManager({ createClient: () => new FakeObsClient(null, obsResponses()), log: (message) => logs.push(message) });
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 1000,
      obs,
      log: (message) => logs.push(message),
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await server.close();
    await obs.disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  const send = (path: string, method: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const getJson = async (path: string) => (await fetch(`${baseUrl}${path}`)).json();
  const enable = () => send("/api/settings", "PUT", { obs: { enabled: true, host: "127.0.0.1", port: 4455, password: PASSWORD } });
  const waitForStatus = async (status: string) => {
    for (let i = 0; i < 50 && obs.status().status !== status; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(obs.status().status).toBe(status);
  };

  it("shows OBS settings without the password and stores the password only on disk", async () => {
    expect((await getJson("/api/settings")) as object).toMatchObject({ obs: { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: false } });

    const updated = await enable();
    const text = await updated.text();
    expect(JSON.parse(text)).toMatchObject({ obs: { enabled: true, host: "127.0.0.1", port: 4455, hasPassword: true } });
    expect(text).not.toContain(PASSWORD);
    expect(JSON.stringify(await getJson("/api/settings"))).not.toContain(PASSWORD);
    expect(JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).obs.password).toBe(PASSWORD);

    const cleared = await send("/api/settings", "PUT", { obs: { password: "" } });
    expect(await cleared.json()).toMatchObject({ obs: { enabled: true, hasPassword: false } });
  });

  it("validates OBS settings", async () => {
    for (const obsPatch of [{ port: 0 }, { port: 70000 }, { port: "4455" }, { host: "" }, { host: "a b" }, { enabled: "yes" }, { password: 5 }, "on"]) {
      const response = await send("/api/settings", "PUT", { obs: obsPatch });
      expect({ obsPatch, status: response.status }).toEqual({ obsPatch, status: 400 });
    }
  });

  it("connects when enabled, reports status and state over the WebSocket, and disconnects when disabled", async () => {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`);
    const events: ServerEvent[] = [];
    socket.on("message", (data) => events.push(JSON.parse(String(data)) as ServerEvent));
    await new Promise((resolve) => socket.once("open", resolve));

    await enable();
    await waitForStatus("connected");
    expect(FakeObsClient.created[0]!.connects).toEqual([{ url: "ws://127.0.0.1:4455", password: PASSWORD }]);
    expect(await getJson("/api/obs/status")).toEqual({
      enabled: true,
      status: "connected",
      state: { currentScene: "Main", mutedInputs: ["Mic"], streaming: false, recording: true },
    });

    await send("/api/settings", "PUT", { obs: { enabled: false } });
    await waitForStatus("disconnected");
    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.close();

    const types = events.map((event) => (event.type === "obs-status" ? `${event.type}:${event.status}` : event.type));
    expect(types).toEqual(["obs-status:connecting", "obs-status:connected", "obs-state", "obs-status:disconnected"]);
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
    expect(JSON.stringify(logs)).not.toContain(PASSWORD);
  });

  it("lists scenes, inputs and scene items once connected", async () => {
    expect((await fetch(`${baseUrl}/api/obs/scenes`)).status).toBe(409);
    await enable();
    await waitForStatus("connected");

    expect(await getJson("/api/obs/scenes")).toEqual(["BRB", "Main"]);
    expect(await getJson("/api/obs/inputs")).toEqual([
      { name: "Mic", kind: "coreaudio_input_capture" },
      { name: "Desktop Audio", kind: "coreaudio_output_capture" },
      { name: "Camera", kind: "av_capture_input" },
    ]);
    expect(await getJson(`/api/obs/scenes/${encodeURIComponent("Main / Live")}/items`)).toEqual([{ id: 3, sourceName: "Cam", enabled: true }]);
    expect(FakeObsClient.created[0]!.calls).toContainEqual({ type: "GetSceneItemList", data: { sceneName: "Main / Live" } });
  });

  it("runs OBS actions, answering 409 obs-unavailable while disconnected", async () => {
    const execute = (action: unknown) => send("/api/actions/execute", "POST", { action });
    const offline = await execute({ type: "obs.toggleStream" });
    expect(offline.status).toBe(409);
    expect(await offline.json()).toMatchObject({ code: "obs-unavailable" });

    await enable();
    await waitForStatus("connected");
    expect((await execute({ type: "obs.toggleStream" })).status).toBe(200);
    expect((await execute({ type: "obs.switchScene", sceneName: "BRB" })).status).toBe(200);
    expect(FakeObsClient.created[0]!.calls).toEqual(
      expect.arrayContaining([
        { type: "ToggleStream", data: undefined },
        { type: "SetCurrentProgramScene", data: { sceneName: "BRB" } },
      ]),
    );

    FakeObsClient.created[0]!.responses.ToggleRecord = () => {
      throw new Error("Output is busy.");
    };
    const failed = await execute({ type: "obs.toggleRecord" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ code: "obs-request-failed", error: "Output is busy." });
  });

  it("re-tests the connection with the saved settings on demand", async () => {
    const disabled = await send("/api/obs/connect", "POST", {});
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toMatchObject({ code: "obs-disabled" });

    await enable();
    await waitForStatus("connected");
    const retest = await send("/api/obs/connect", "POST", {});
    expect(retest.status).toBe(200);
    expect(await retest.json()).toEqual({ status: "connected" });
    expect(FakeObsClient.created).toHaveLength(2);
    expect((await fetch(`${baseUrl}/api/obs/connect`, { method: "POST" })).status).toBe(415);
  });

  it("forgets the saved password when the host or port changes, unless a new one comes with it", async () => {
    await enable();
    const settingsFile = async () => JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).obs;

    const sameHost = await send("/api/settings", "PUT", { obs: { host: "127.0.0.1", port: 4455 } });
    expect(await sameHost.json()).toMatchObject({ obs: { hasPassword: true } });

    const moved = await send("/api/settings", "PUT", { obs: { host: "10.0.0.5" } });
    expect(await moved.json()).toMatchObject({ obs: { host: "10.0.0.5", hasPassword: false } });
    expect((await settingsFile()).password).toBe("");

    await send("/api/settings", "PUT", { obs: { host: "10.0.0.6", password: "new-password" } });
    expect((await settingsFile()).password).toBe("new-password");

    const newPort = await send("/api/settings", "PUT", { obs: { port: 4456 } });
    expect(await newPort.json()).toMatchObject({ obs: { port: 4456, hasPassword: false } });
  });
});

describe("OBS API from other devices", () => {
  let dir: string;
  let obs: ObsConnectionManager;
  let settings: JsonFileSettingsStore;
  let handle: ReturnType<typeof createApiHandler>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-obs-lan-"));
    FakeObsClient.created = [];
    obs = new ObsConnectionManager({ createClient: () => new FakeObsClient(null, obsResponses()) });
    settings = new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true });
    await settings.update({ obs: { enabled: true, host: "127.0.0.1", port: 4455, password: PASSWORD } });
    handle = createApiHandler({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings,
      synthesizer: new FakeSynthesizer(),
      broadcast: () => {},
      generateId: () => "id",
      now: () => 1,
      instanceId: "test",
      obs,
    });
  });

  afterEach(async () => {
    await obs.disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  /** Sends a request through the API handler as if it came from `remoteAddress`. */
  const ask = async (remoteAddress: string, method: string, path: string, body: unknown) => {
    const payload = JSON.stringify(body);
    const request = Object.assign(Readable.from([Buffer.from(payload)]), {
      method,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) },
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

  it("refuses OBS settings changes from other devices and keeps the stored ones", async () => {
    for (const remoteAddress of ["192.168.1.30", "::ffff:192.168.1.30", "fe80::1"]) {
      const result = await ask(remoteAddress, "PUT", "/api/settings", { obs: { host: "evil.example", enabled: true } });
      expect({ remoteAddress, ...result }).toMatchObject({ remoteAddress, status: 403, body: { code: "loopback-only" } });
    }
    const stored = await settings.loadStored();
    expect(stored.obs).toEqual({ enabled: true, host: "127.0.0.1", port: 4455, password: PASSWORD });
    expect(FakeObsClient.created).toHaveLength(0);
  });

  it("still lets other devices change settings that do not touch OBS", async () => {
    const result = await ask("192.168.1.30", "PUT", "/api/settings", { rate: 1.5 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ rate: 1.5, obs: { host: "127.0.0.1", hasPassword: true } });
  });

  it("only reconnects OBS on demand from this computer", async () => {
    const remote = await ask("192.168.1.30", "POST", "/api/obs/connect", {});
    expect(remote).toMatchObject({ status: 403, body: { code: "loopback-only" } });
    expect(FakeObsClient.created).toHaveLength(0);

    const local = await ask("127.0.0.1", "PUT", "/api/settings", { obs: { port: 4455 } });
    expect(local.status).toBe(200);
  });
});
