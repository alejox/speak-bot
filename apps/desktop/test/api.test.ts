import type { ServerEvent, SpeakOptions, Voice } from "@speak-bot/core";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { SpeechEngineUnavailableError } from "../src/adapters/tts/process-speech-synthesizer";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";
import { FakeSynthesizer } from "./fake-synthesizer";

/** OBS settings as the API shows them by default: the password is never sent. */
const OBS_OFF = { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: false };

describe("desktop HTTP API", () => {
  let dir: string;
  let server: DesktopServer;
  let synthesizer: FakeSynthesizer;
  let baseUrl: string;
  let settingsChanges: unknown[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speak-bot-api-"));
    synthesizer = new FakeSynthesizer();
    settingsChanges = [];
    let id = 0;
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer,
      generateId: () => `id-${++id}`,
      now: () => 1000 + id,
      onSettingsChanged: (settings) => settingsChanges.push(settings),
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown, method = "POST") =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  async function connect(): Promise<{ events: ServerEvent[]; next: (count: number) => Promise<ServerEvent[]>; close: () => void }> {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`);
    const events: ServerEvent[] = [];
    const waiters: Array<() => void> = [];
    socket.on("message", (data) => {
      events.push(JSON.parse(String(data)) as ServerEvent);
      for (const waiter of waiters.splice(0)) waiter();
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    const next = async (count: number) => {
      while (events.length < count) await new Promise<void>((resolve) => waiters.push(resolve));
      return events.slice(0, count);
    };
    return { events, next, close: () => socket.close() };
  }

  it("reports health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      name: "speak-bot-desktop",
      capabilities: { platform: "test", engine: "fake", supportsDeviceSelection: true },
      instanceId: expect.any(String),
    });
  });



  it("speaks text with the saved settings and broadcasts caption and speaking events", async () => {
    await post("/api/settings", { voiceId: "Alex", rate: 1.2, deviceId: "BlackHole 2ch" }, "PUT");
    const client = await connect();

    const response = await post("/api/speak", { text: "Hello stream" });
    expect(response.status).toBe(202);
    expect(synthesizer.spoken).toEqual([
      { text: "Hello stream", options: { voiceId: "Alex", rate: 1.2, deviceId: "BlackHole 2ch" } },
    ]);

    synthesizer.finishCurrent();
    const events = await client.next(3);
    expect(events[0]).toMatchObject({ type: "caption", text: "Hello stream" });
    expect(events.slice(1)).toMatchObject([
      { type: "speaking", state: "start" },
      { type: "speaking", state: "end" },
    ]);
    client.close();
  });

  it("broadcasts a speak-error when the engine fails", async () => {
    synthesizer.failNext = new Error("Command not found: espeak-ng. Install espeak-ng and pulseaudio-utils.");
    const client = await connect();

    await post("/api/speak", { text: "Hello" });

    const events = await client.next(4);
    expect(events.map((e) => e.type)).toEqual(["caption", "speaking", "speak-error", "speaking"]);
    expect(events[2]).toMatchObject({ message: expect.stringContaining("espeak-ng") });
    client.close();
  });

  it("stops speaking and broadcasts the end", async () => {
    const client = await connect();
    await post("/api/speak", { text: "Long text" });

    const response = await post("/api/stop", {});
    expect(response.status).toBe(200);
    expect(synthesizer.cancelCount).toBe(1);
    expect((await client.next(3)).map((e) => e.type === "speaking" && e.state)).toEqual([false, "start", "end"]);
    client.close();
  });

  it("validates input", async () => {
    const cases: Array<[string, unknown, number]> = [
      ["/api/speak", {}, 400],
      ["/api/speak", { text: "   " }, 400],
      ["/api/speak", { text: "x".repeat(1001) }, 400],
      ["/api/speak", { text: "Hi", rate: 10 }, 400],
      ["/api/speak", "{ broken", 400],
    ];
    for (const [path, body, status] of cases) {
      const response = await post(path, body);
      expect({ path, body, status: response.status }).toEqual({ path, body, status });
      expect(await response.json()).toHaveProperty("error");
    }
    expect(synthesizer.spoken).toEqual([]);
  });

  it("rejects non-JSON content types and oversized bodies", async () => {
    const plain = await fetch(`${baseUrl}/api/speak`, { method: "POST", body: JSON.stringify({ text: "Hi" }) });
    expect(plain.status).toBe(415);

    const huge = await post("/api/speak", { text: "x".repeat(20_000) });
    expect(huge.status).toBe(413);
    expect(synthesizer.spoken).toEqual([]);
  });

  it("lists voices and devices and persists settings", async () => {
    expect(await (await fetch(`${baseUrl}/api/voices`)).json()).toEqual([
      { id: "Alex", name: "Alex", lang: "en-US", isDefault: false },
    ]);
    expect(await (await fetch(`${baseUrl}/api/devices`)).json()).toEqual([{ id: "BlackHole 2ch", name: "BlackHole 2ch" }]);

    expect(await (await fetch(`${baseUrl}/api/settings`)).json()).toEqual({ voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true, obs: OBS_OFF });
    const updated = await post("/api/settings", { deviceId: "BlackHole 2ch" }, "PUT");
    expect(await updated.json()).toEqual({ voiceId: "", rate: 1, deviceId: "BlackHole 2ch", language: "es", captionsVisible: true, obs: OBS_OFF });
    expect((await post("/api/settings", { rate: "fast" }, "PUT")).status).toBe(400);

    const reopened = new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true });
    expect(await reopened.load()).toEqual({ voiceId: "", rate: 1, deviceId: "BlackHole 2ch", language: "es", captionsVisible: true, obs: OBS_OFF });
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const response = await fetch(`${baseUrl}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toHaveProperty("error");
  });

  it("validates and persists the interface language and reports settings changes", async () => {
    expect((await post("/api/settings", { language: "fr" }, "PUT")).status).toBe(400);
    expect((await post("/api/settings", { language: 1 }, "PUT")).status).toBe(400);

    const updated = await post("/api/settings", { language: "en", captionsVisible: true }, "PUT");
    expect(await updated.json()).toEqual({ voiceId: "", rate: 1, deviceId: "", language: "en", captionsVisible: true, obs: OBS_OFF });
    expect(settingsChanges).toEqual([{ voiceId: "", rate: 1, deviceId: "", language: "en", captionsVisible: true, obs: OBS_OFF }]);
  });

  it("uses a voice matching the interface language when no voice is chosen, listing voices once", async () => {
    synthesizer.voices = [
      { id: "Alex", name: "Alex", lang: "en_US", isDefault: false },
      { id: "Monica", name: "Monica", lang: "es_ES", isDefault: false },
    ];

    await post("/api/speak", { text: "Hola" });
    synthesizer.finishCurrent();
    await post("/api/settings", { language: "en", captionsVisible: true }, "PUT");
    await post("/api/speak", { text: "Hello" });
    synthesizer.finishCurrent();
    await post("/api/settings", { voiceId: "Chosen" }, "PUT");
    await post("/api/speak", { text: "Mine" });

    expect(synthesizer.spoken.map((entry) => entry.options?.voiceId)).toEqual(["Monica", "Alex", "Chosen"]);
    expect(synthesizer.voiceListCount).toBe(1);
  });



  it("repeats the last spoken text with the saved settings, or explains that nothing was said", async () => {
    const nothing = await post("/api/repeat", {});
    expect(nothing.status).toBe(404);
    expect(await nothing.json()).toEqual({ error: expect.any(String), code: "nothing-to-repeat" });
    expect(synthesizer.spoken).toEqual([]);

    await post("/api/speak", { text: "Thank you", voiceId: "Other", rate: 0.8 });
    synthesizer.finishCurrent();
    const client = await connect();

    const repeated = await post("/api/repeat", {});
    expect(repeated.status).toBe(202);
    expect(synthesizer.spoken.map((entry) => entry.text)).toEqual(["Thank you", "Thank you"]);
    expect(synthesizer.spoken[0]!.options).toEqual({ voiceId: "Other", rate: 0.8 });
    expect(synthesizer.spoken[1]!.options).toEqual({ voiceId: undefined, rate: 1 });
    expect((await client.next(2)).map((e) => e.type)).toEqual(["caption", "speaking"]);
    client.close();

    const plain = await fetch(`${baseUrl}/api/repeat`, { method: "POST", body: "{}" });
    expect(plain.status).toBe(415);
  });

  it("clears the OBS caption", async () => {
    const client = await connect();

    const response = await post("/api/captions/clear", {});
    expect(response.status).toBe(200);
    expect((await client.next(1))[0]).toEqual({ type: "caption-clear", at: expect.any(Number) });
    client.close();

    const plain = await fetch(`${baseUrl}/api/captions/clear`, { method: "POST" });
    expect(plain.status).toBe(415);
    expect((await fetch(`${baseUrl}/api/captions/clear`)).status).toBe(404);
  });

  it("hides and shows captions, persisting the choice and telling the overlay", async () => {
    const client = await connect();

    const hidden = await post("/api/settings", { captionsVisible: false }, "PUT");
    expect(await hidden.json()).toMatchObject({ captionsVisible: false });
    await post("/api/settings", { captionsVisible: true }, "PUT");
    await post("/api/settings", { rate: 1.5 }, "PUT");
    expect((await post("/api/settings", { captionsVisible: "no" }, "PUT")).status).toBe(400);

    expect(await (await fetch(`${baseUrl}/api/settings`)).json()).toMatchObject({ captionsVisible: true, rate: 1.5 });
    const events = await client.next(2);
    expect(events).toEqual([
      { type: "captions-visibility", visible: false, at: expect.any(Number) },
      { type: "captions-visibility", visible: true, at: expect.any(Number) },
    ]);
    client.close();
  });

  it("picks the automatic voice for the chosen voice language", async () => {
    synthesizer.voices = [
      { id: "Alex", name: "Alex", lang: "en_US", isDefault: false },
      { id: "Monica", name: "Monica", lang: "es_ES", isDefault: false },
    ];
    expect((await post("/api/settings", { voiceLanguage: "fr" }, "PUT")).status).toBe(400);

    const updated = await post("/api/settings", { voiceLanguage: "en", voiceId: "" }, "PUT");
    expect(await updated.json()).toMatchObject({ language: "es", voiceLanguage: "en" });
    await post("/api/speak", { text: "Hello" });

    expect(synthesizer.spoken[0]!.options?.voiceId).toBe("Alex");
  });

  it("tells clients why speech failed with an error code", async () => {
    synthesizer.failNext = new SpeechEngineUnavailableError("Command not found: espeak-ng. Install espeak-ng.");
    const client = await connect();

    await post("/api/speak", { text: "Hello" });

    const events = await client.next(3);
    expect(events[2]).toMatchObject({ type: "speak-error", code: "engine-unavailable" });
    client.close();
  });
});

// Keep SpeakOptions referenced so the fake stays aligned with the core port.
export type _Aligned = SpeakOptions;
