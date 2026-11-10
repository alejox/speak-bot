import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopApiClient } from "../src/adapters/desktop-api";
import { DesktopEventSource } from "../src/adapters/desktop-events";
import { RemotePhraseRepository } from "../src/adapters/remote-phrase-repository";
import { DesktopSpeechError, RemoteSpeechSynthesizer } from "../src/adapters/remote-speech-synthesizer";
import { boardsOf, createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";

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
  it("returns the capabilities of a Speed Deck desktop server", async () => {
    const { api, requests } = setup(() => ({ body: { ok: true, name: "speed-deck-desktop", capabilities } }));

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

describe("DesktopApiClient boards", () => {
  it("calls every board endpoint", async () => {
    const { api, requests } = setup((request) => ({ status: request.method === "DELETE" ? 204 : 200, body: request.method === "GET" ? boardsOf([]) : {} }));

    expect(await api.listBoards()).toEqual(boardsOf([]));
    await api.createBoard("OBS");
    await api.renameBoard("a/b", "Escenas");
    await api.deleteBoard("a/b");
    await api.setKey("b1", 3, { label: "Hi", action: { type: "voice.stop" } }, { replace: true });
    await api.clearKey("b1", 3);
    await api.moveKey("b1", 3, 4);
    await api.restoreDefaultBoard("en");
    await api.executeAction({ type: "captions.clear" });

    expect(requests).toEqual([
      { method: "GET", url: "/api/boards", body: undefined },
      { method: "POST", url: "/api/boards", body: { name: "OBS" } },
      { method: "PATCH", url: "/api/boards/a%2Fb", body: { name: "Escenas" } },
      { method: "DELETE", url: "/api/boards/a%2Fb", body: undefined },
      { method: "PUT", url: "/api/boards/b1/keys/3", body: { label: "Hi", action: { type: "voice.stop" }, replace: true } },
      { method: "DELETE", url: "/api/boards/b1/keys/3", body: undefined },
      { method: "POST", url: "/api/boards/b1/keys/move", body: { from: 3, to: 4 } },
      { method: "POST", url: "/api/boards/restore-default", body: { language: "en" } },
      { method: "POST", url: "/api/actions/execute", body: { action: { type: "captions.clear" } } },
    ]);
  });

  it("drops invalid boards and keys sent by the desktop", async () => {
    const { api } = setup(() => ({ body: [...boardsOf([{ text: "Hi", slot: 0 }]), { id: 5 }] }));
    expect(await api.listBoards()).toEqual(boardsOf([{ text: "Hi", slot: 0 }]));
  });
});

describe("DesktopApiClient OBS", () => {
  it("reads OBS status and lists, and re-tests the connection", async () => {
    const { api, requests } = setup(() => ({ body: [] }));

    await api.loadObsStatus();
    await api.listObsScenes();
    await api.listObsInputs();
    await api.listObsSceneItems("Main / Live");
    await api.connectObs();
    await api.saveSettings({ obs: { enabled: true, password: "" } });

    expect(requests).toEqual([
      { method: "GET", url: "/api/obs/status", body: undefined },
      { method: "GET", url: "/api/obs/scenes", body: undefined },
      { method: "GET", url: "/api/obs/inputs", body: undefined },
      { method: "GET", url: "/api/obs/scenes/Main%20%2F%20Live/items", body: undefined },
      { method: "POST", url: "/api/obs/connect", body: {} },
      { method: "PUT", url: "/api/settings", body: { obs: { enabled: true, password: "" } } },
    ]);
  });
});

describe("RemotePhraseRepository", () => {
  const route = (phrases: Parameters<typeof boardsOf>[0]) => (request: RecordedRequest) =>
    request.method === "GET" ? { body: boardsOf(phrases) } : { status: request.method === "DELETE" ? 204 : 200, body: {} };

  it("reads the speak keys of the first desktop board as phrases", async () => {
    const { api } = setup((request) => {
      const [board] = boardsOf([{ text: "Hi", label: "H", slot: 2 }]);
      return { body: [{ ...board, keys: [...board!.keys, { slot: 10, action: { type: "voice.stop" } }] }] };
    });

    expect(await new RemotePhraseRepository(api).list()).toEqual([{ id: "slot-2", text: "Hi", label: "H", slot: 2, createdAt: 2 }]);
  });

  it("saves into an empty key, so a key filled by another device is never overwritten", async () => {
    const { api, requests } = setup(route([]));
    const repository = new RemotePhraseRepository(api);

    await repository.save({ id: "new", text: "Water", label: "W", slot: 1, createdAt: 2 });
    await repository.delete("slot-1");

    expect(requests).toEqual([
      { method: "GET", url: "/api/boards", body: undefined },
      { method: "PUT", url: "/api/boards/communication/keys/1", body: { label: "W", action: { type: "voice.speak", text: "Water" } } },
      { method: "DELETE", url: "/api/boards/communication/keys/1", body: undefined },
    ]);
  });

  it("updates a phrase in place, moving it first when its slot changed", async () => {
    const { api, requests } = setup(route([{ text: "Hello", slot: 0 }]));
    const repository = new RemotePhraseRepository(api);

    await repository.update({ id: "slot-0", text: "Hello", slot: 0, createdAt: 0 });
    await repository.update({ id: "slot-0", text: "Hi", label: "H", slot: 4, createdAt: 0 });

    expect(requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "PUT", url: "/api/boards/communication/keys/0", body: { label: "", action: { type: "voice.speak", text: "Hello" }, replace: true } },
      { method: "POST", url: "/api/boards/communication/keys/move", body: { from: 0, to: 4 } },
      { method: "PUT", url: "/api/boards/communication/keys/4", body: { label: "H", action: { type: "voice.speak", text: "Hi" }, replace: true } },
    ]);
  });

  it("exposes the error code the desktop sends", async () => {
    const { api } = setup((request) =>
      request.method === "GET" ? { body: boardsOf([]) } : { status: 409, body: { error: "Slot 3 is already in use.", code: "slot-occupied" } },
    );

    await expect(new RemotePhraseRepository(api).save({ id: "x", text: "Hi", slot: 3, createdAt: 1 })).rejects.toMatchObject({
      status: 409,
      code: "slot-occupied",
    });
  });

  it("refuses to replace every phrase and sends nothing to the desktop", async () => {
    const { api, requests } = setup();

    await expect(new RemotePhraseRepository(api).replaceAll([])).rejects.toThrow("restoreDefaultBoard");
    expect(requests).toEqual([]);
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
    FakeSocket.instances[1]!.emit({ type: "boards-changed", at: 1 });
    FakeSocket.instances[1]!.emit({ type: "nonsense" });
    expect(received).toEqual([{ type: "boards-changed", at: 1 }]);

    unsubscribe();
    expect(FakeSocket.instances[1]!.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
