import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopApiClient } from "../src/adapters/desktop-api";
import { DesktopEventSource } from "../src/adapters/desktop-events";
import { RemotePhraseRepository } from "../src/adapters/remote-phrase-repository";
import { DesktopSpeechError, RemoteSpeechSynthesizer } from "../src/adapters/remote-speech-synthesizer";
import { createFakeFetch, FakeSocket } from "./desktop-fakes";

const capabilities = { platform: "darwin", engine: "say", supportsDeviceSelection: true };

function setup(route: Parameters<typeof createFakeFetch>[0] = () => ({ status: 202, body: { ok: true } })) {
  FakeSocket.instances = [];
  const fake = createFakeFetch(route);
  const api = new DesktopApiClient(fake.fetch);
  const events = new DesktopEventSource((url) => new FakeSocket(url), { protocol: "http:", host: "192.168.1.5:4545" });
  return { ...fake, api, events, synthesizer: new RemoteSpeechSynthesizer(api, events) };
}

afterEach(() => vi.useRealTimers());

describe("DesktopApiClient.detect", () => {
  it("returns the capabilities of a speak-bot desktop server", async () => {
    const { api, requests } = setup(() => ({ body: { ok: true, name: "speak-bot-desktop", capabilities } }));

    expect(await api.detect()).toEqual(capabilities);
    expect(requests[0]).toMatchObject({ method: "GET", url: "/api/health" });
  });

  it("returns null for other servers, errors and timeouts", async () => {
    expect(await setup(() => ({ body: { ok: true, name: "other" } })).api.detect()).toBeNull();
    expect(await setup(() => ({ status: 404 })).api.detect()).toBeNull();
    expect(await new DesktopApiClient(() => Promise.reject(new Error("offline"))).detect()).toBeNull();

    vi.useFakeTimers();
    const hanging = new DesktopApiClient((_input, init) => {
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    const result = hanging.detect(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBeNull();
  });
});

describe("RemotePhraseRepository", () => {
  it("lists, saves and deletes phrases over HTTP", async () => {
    const { api, requests } = setup((request) =>
      request.method === "GET"
        ? { body: [{ id: "a", text: "Hi", createdAt: 1 }, { bogus: true }] }
        : { status: request.method === "DELETE" ? 204 : 201, body: request.body },
    );
    const repository = new RemotePhraseRepository(api);

    expect(await repository.list()).toEqual([{ id: "a", text: "Hi", createdAt: 1 }]);
    await repository.save({ id: "b", text: "Water", label: "W", createdAt: 2 });
    await repository.delete("id/with space");

    expect(requests).toEqual([
      { method: "GET", url: "/api/phrases", body: undefined },
      { method: "POST", url: "/api/phrases", body: { id: "b", text: "Water", label: "W", createdAt: 2 } },
      { method: "DELETE", url: "/api/phrases/id%2Fwith%20space", body: undefined },
    ]);
  });

  it("throws when the desktop rejects a request", async () => {
    const repository = new RemotePhraseRepository(setup(() => ({ status: 400, body: { error: "text too long" } })).api);

    await expect(repository.save({ id: "x", text: "Hi", createdAt: 1 })).rejects.toThrow("text too long");
  });
});

describe("RemoteSpeechSynthesizer", () => {
  it("posts the text and resolves when the desktop reports the end", async () => {
    const { synthesizer, requests } = setup();

    const done = synthesizer.speak("Hello", { voiceId: "Alex", rate: 1.2 });
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe("ws://192.168.1.5:4545/ws");
    socket.open();
    expect(requests[0]).toEqual({ method: "POST", url: "/api/speak", body: { text: "Hello", voiceId: "Alex", rate: 1.2 } });

    let settled = false;
    void done.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    socket.emit({ type: "speaking", state: "start", at: 1 });
    socket.emit({ type: "speaking", state: "end", at: 2 });
    await expect(done).resolves.toBeUndefined();
  });

  it("resolves right after the request when events are not connected", async () => {
    const { synthesizer } = setup();

    await expect(synthesizer.speak("Hello")).resolves.toBeUndefined();
  });

  it("rejects with the desktop error message", async () => {
    const { synthesizer } = setup();
    const done = synthesizer.speak("Hello");
    FakeSocket.instances[0]!.open();

    FakeSocket.instances[0]!.emit({ type: "speak-error", message: "Install espeak-ng", at: 1 });

    await expect(done).rejects.toEqual(new DesktopSpeechError("Install espeak-ng"));
  });

  it("rejects when the request fails", async () => {
    const { synthesizer } = setup(() => ({ status: 400, body: { error: "text must be at most 1000 characters." } }));

    await expect(synthesizer.speak("x")).rejects.toThrow("at most 1000");
  });

  it("stops through the API and settles the pending utterance", async () => {
    const { synthesizer, requests } = setup();
    const done = synthesizer.speak("Hello");
    FakeSocket.instances[0]!.open();

    synthesizer.cancel();

    await expect(done).resolves.toBeUndefined();
    expect(requests.map((r) => `${r.method} ${r.url}`)).toContain("POST /api/stop");
  });

  it("lists the desktop voices", async () => {
    const voices = [{ id: "Alex", name: "Alex", lang: "en-US", isDefault: false }];
    const { synthesizer } = setup(() => ({ body: voices }));

    expect(synthesizer.isSupported).toBe(true);
    expect(await synthesizer.listVoices()).toEqual(voices);
  });
});

describe("DesktopEventSource", () => {
  it("reconnects after the connection drops while someone listens", async () => {
    vi.useFakeTimers();
    const { events } = setup();
    const received: unknown[] = [];
    const unsubscribe = events.subscribe((event) => received.push(event));
    FakeSocket.instances[0]!.open();

    FakeSocket.instances[0]!.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1]!.open();
    FakeSocket.instances[1]!.emit({ type: "phrases-changed", at: 1 });
    FakeSocket.instances[1]!.emit({ type: "nonsense" });
    expect(received).toEqual([{ type: "phrases-changed", at: 1 }]);

    unsubscribe();
    expect(FakeSocket.instances[1]!.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
