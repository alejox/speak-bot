import type { Phrase, ServerEvent, SpeakOptions, Voice } from "@speak-bot/core";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFilePhraseRepository } from "../src/adapters/json-file-phrase-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import {
  SpeechEngineUnavailableError,
  type DesktopSpeakOptions,
  type DesktopSpeechSynthesizer,
} from "../src/adapters/tts/process-speech-synthesizer";
import { DEFAULT_PHRASES } from "../src/default-phrases";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";

class FakeSynthesizer implements DesktopSpeechSynthesizer {
  readonly capabilities = { platform: "test", engine: "fake", supportsDeviceSelection: true };
  failNext: Error | undefined;
  readonly spoken: Array<{ text: string; options: DesktopSpeakOptions | undefined }> = [];
  cancelCount = 0;
  voiceListCount = 0;
  voices: Voice[] = [{ id: "Alex", name: "Alex", lang: "en-US", isDefault: false }];
  private finish: (() => void) | undefined;

  speak(text: string, options?: DesktopSpeakOptions): Promise<void> {
    this.spoken.push({ text, options });
    if (this.failNext) return Promise.reject(this.failNext);
    return new Promise((resolve) => (this.finish = resolve));
  }
  finishCurrent() {
    this.finish?.();
  }
  cancel() {
    this.cancelCount += 1;
    this.finish?.();
  }
  async listVoices(): Promise<Voice[]> {
    this.voiceListCount += 1;
    return this.voices;
  }
  async listDevices() {
    return [{ id: "BlackHole 2ch", name: "BlackHole 2ch" }];
  }
}

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
      repository: new JsonFilePhraseRepository(join(dir, "phrases.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es" }),
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

  it("creates, lists and deletes phrases and broadcasts phrases-changed", async () => {
    const client = await connect();

    const created = await post("/api/phrases", { text: "  I need water " });
    expect(created.status).toBe(201);
    const phrase = (await created.json()) as Phrase;
    expect(phrase).toEqual({ id: "id-1", text: "I need water", createdAt: 1001 });

    const upserted = await post("/api/phrases", { id: "client-1", text: "Hello", createdAt: 5 });
    expect(await upserted.json()).toEqual({ id: "client-1", text: "Hello", createdAt: 5 });

    const listed = (await (await fetch(`${baseUrl}/api/phrases`)).json()) as Phrase[];
    expect(listed.map((p) => p.id)).toEqual(["client-1", "id-1"]);

    const deleted = await fetch(`${baseUrl}/api/phrases/client-1`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect(((await (await fetch(`${baseUrl}/api/phrases`)).json()) as Phrase[]).map((p) => p.id)).toEqual(["id-1"]);

    expect((await client.next(3)).map((e) => e.type)).toEqual(["phrases-changed", "phrases-changed", "phrases-changed"]);
    client.close();
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

  it("speaks a saved phrase by id, with per-request voice and rate overrides", async () => {
    const phrase = (await (await post("/api/phrases", { text: "Thank you" })).json()) as Phrase;
    const client = await connect();

    await post("/api/speak", { phraseId: phrase.id, voiceId: "Other", rate: 0.8 });

    expect(synthesizer.spoken[0]).toEqual({ text: "Thank you", options: { voiceId: "Other", rate: 0.8 } });
    expect((await client.next(1))[0]).toMatchObject({ type: "caption", text: "Thank you", phraseId: phrase.id });
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
      ["/api/speak", { phraseId: "missing" }, 404],
      ["/api/speak", "{ broken", 400],
      ["/api/phrases", { text: "" }, 400],
      ["/api/phrases", { text: 42 }, 400],
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

    expect(await (await fetch(`${baseUrl}/api/settings`)).json()).toEqual({ voiceId: "", rate: 1, deviceId: "", language: "es" });
    const updated = await post("/api/settings", { deviceId: "BlackHole 2ch" }, "PUT");
    expect(await updated.json()).toEqual({ voiceId: "", rate: 1, deviceId: "BlackHole 2ch", language: "es" });
    expect((await post("/api/settings", { rate: "fast" }, "PUT")).status).toBe(400);

    const reopened = new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es" });
    expect(await reopened.load()).toEqual({ voiceId: "", rate: 1, deviceId: "BlackHole 2ch", language: "es" });
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const response = await fetch(`${baseUrl}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toHaveProperty("error");
  });

  it("validates and persists the interface language and reports settings changes", async () => {
    expect((await post("/api/settings", { language: "fr" }, "PUT")).status).toBe(400);
    expect((await post("/api/settings", { language: 1 }, "PUT")).status).toBe(400);

    const updated = await post("/api/settings", { language: "en" }, "PUT");
    expect(await updated.json()).toEqual({ voiceId: "", rate: 1, deviceId: "", language: "en" });
    expect(settingsChanges).toEqual([{ voiceId: "", rate: 1, deviceId: "", language: "en" }]);
  });

  it("uses a voice matching the interface language when no voice is chosen, listing voices once", async () => {
    synthesizer.voices = [
      { id: "Alex", name: "Alex", lang: "en_US", isDefault: false },
      { id: "Monica", name: "Monica", lang: "es_ES", isDefault: false },
    ];

    await post("/api/speak", { text: "Hola" });
    synthesizer.finishCurrent();
    await post("/api/settings", { language: "en" }, "PUT");
    await post("/api/speak", { text: "Hello" });
    synthesizer.finishCurrent();
    await post("/api/settings", { voiceId: "Chosen" }, "PUT");
    await post("/api/speak", { text: "Mine" });

    expect(synthesizer.spoken.map((entry) => entry.options?.voiceId)).toEqual(["Monica", "Alex", "Chosen"]);
    expect(synthesizer.voiceListCount).toBe(1);
  });

  it("restores the default phrases in the requested language and broadcasts phrases-changed", async () => {
    await post("/api/phrases", { text: "Mine" });
    const client = await connect();

    const response = await post("/api/phrases/restore", { language: "es" });
    expect(response.status).toBe(200);
    const restored = (await response.json()) as Phrase[];
    expect(restored.map((p) => p.text)).toEqual([...DEFAULT_PHRASES.es]);
    const listed = (await (await fetch(`${baseUrl}/api/phrases`)).json()) as Phrase[];
    expect(listed.map((p) => p.text)).toEqual([...DEFAULT_PHRASES.es]);
    expect((await client.next(1))[0]).toMatchObject({ type: "phrases-changed" });
    client.close();

    await post("/api/phrases/restore", { language: "en" });
    const english = (await (await fetch(`${baseUrl}/api/phrases`)).json()) as Phrase[];
    expect(english.map((p) => p.text)).toEqual([...DEFAULT_PHRASES.en]);
  });

  it("ends with exactly the default phrases when two restores run at the same time", async () => {
    await post("/api/phrases", { text: "Mine" });

    const responses = await Promise.all([
      post("/api/phrases/restore", { language: "es" }),
      post("/api/phrases/restore", { language: "es" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const listed = (await (await fetch(`${baseUrl}/api/phrases`)).json()) as Phrase[];
    expect(listed).toHaveLength(DEFAULT_PHRASES.es.length);
    expect(listed.map((p) => p.text)).toEqual([...DEFAULT_PHRASES.es]);
  });

  it("validates the restore language and keeps the phrases on error", async () => {
    await post("/api/phrases", { text: "Mine" });

    for (const body of [{}, { language: "fr" }, { language: 1 }, "{ broken"]) {
      const response = await post("/api/phrases/restore", body);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    }
    const plain = await fetch(`${baseUrl}/api/phrases/restore`, { method: "POST", body: JSON.stringify({ language: "es" }) });
    expect(plain.status).toBe(415);

    const listed = (await (await fetch(`${baseUrl}/api/phrases`)).json()) as Phrase[];
    expect(listed.map((p) => p.text)).toEqual(["Mine"]);
  });

  it("still deletes a phrase whose id is \"restore\"", async () => {
    await post("/api/phrases", { id: "restore", text: "Odd id" });
    expect((await fetch(`${baseUrl}/api/phrases/restore`, { method: "DELETE" })).status).toBe(204);
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
