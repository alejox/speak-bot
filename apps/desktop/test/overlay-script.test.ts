import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OVERLAY_FILE } from "../src/server/static-files";

/** Just enough DOM for the overlay script: one caption element, the body classes and a scripted WebSocket. */
class FakeClassList {
  private readonly names = new Set<string>();
  add(name: string) {
    this.names.add(name);
  }
  remove(name: string) {
    this.names.delete(name);
  }
  contains(name: string) {
    return this.names.has(name);
  }
}

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = 1;
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
}

/** An <audio> element the test drives: `play()` resolves or rejects, then the test fires playing/ended/error. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectPlay = false;
  paused = true;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play() {
    if (FakeAudio.rejectPlay) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}

async function loadOverlay(settings: { captionsVisible?: boolean } | Error = { captionsVisible: true }, search = "?hold=1000") {
  const html = await readFile(OVERLAY_FILE, "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error("overlay script not found");

  FakeSocket.instances = [];
  FakeAudio.instances = [];
  FakeAudio.rejectPlay = false;
  const caption = { textContent: "", classList: new FakeClassList(), style: { setProperty: () => {} } };
  const typing = { classList: new FakeClassList(), style: { setProperty: () => {} } };
  const typingLabel = { textContent: "" };
  const elements: Record<string, unknown> = { caption, typing, "typing-label": typingLabel };
  const fetchCalls: string[] = [];
  const fetchFn = async (url: string) => {
    fetchCalls.push(url);
    if (settings instanceof Error) throw settings;
    return { ok: true, json: async () => settings };
  };
  runInNewContext(script, {
    window: { location: { protocol: "http:", host: "127.0.0.1:4545", search } },
    document: { getElementById: (id: string) => elements[id], body: { classList: new FakeClassList() } },
    URLSearchParams,
    WebSocket: FakeSocket,
    Audio: FakeAudio,
    fetch: fetchFn,
    CSS: { supports: () => true },
    JSON,
    Number,
    Math,
    setTimeout,
    clearTimeout,
  });
  const socket = FakeSocket.instances[0]!;
  socket.onopen?.();
  // Let the settings request settle.
  await vi.advanceTimersByTimeAsync(0);
  return {
    caption,
    socket,
    fetchCalls,
    typingLabel,
    isShown: () => caption.classList.contains("visible"),
    isTyping: () => typing.classList.contains("visible"),
  };
}

describe("overlay script", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a caption and hides it after the hold time once speech ends", async () => {
    const { caption, socket, isShown } = await loadOverlay();

    socket.emit({ type: "caption", text: "Hola chat", at: 1 });
    socket.emit({ type: "speaking", state: "start", at: 1 });
    expect(caption.textContent).toBe("Hola chat");
    expect(isShown()).toBe(true);

    socket.emit({ type: "speaking", state: "end", at: 2 });
    await vi.advanceTimersByTimeAsync(999);
    expect(isShown()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isShown()).toBe(false);
  });

  it("hides the caption immediately on caption-clear", async () => {
    const { socket, isShown } = await loadOverlay();
    socket.emit({ type: "caption", text: "Oops", at: 1 });

    socket.emit({ type: "caption-clear", at: 2 });

    expect(isShown()).toBe(false);
  });

  it("ignores captions while hidden and shows new ones again once visible", async () => {
    const { caption, socket, isShown } = await loadOverlay();
    socket.emit({ type: "caption", text: "Before", at: 1 });

    socket.emit({ type: "captions-visibility", visible: false, at: 2 });
    expect(isShown()).toBe(false);
    socket.emit({ type: "caption", text: "Secret", at: 3 });
    expect(isShown()).toBe(false);
    expect(caption.textContent).not.toBe("Secret");

    socket.emit({ type: "captions-visibility", visible: true, at: 4 });
    expect(isShown()).toBe(false);
    socket.emit({ type: "caption", text: "After", at: 5 });
    expect(isShown()).toBe(true);
    expect(caption.textContent).toBe("After");
  });

  it("reads the saved visibility when it connects", async () => {
    const { socket, fetchCalls, isShown } = await loadOverlay({ captionsVisible: false });

    expect(fetchCalls).toEqual(["/api/settings"]);
    socket.emit({ type: "caption", text: "Hidden", at: 1 });
    expect(isShown()).toBe(false);
  });

  it("keeps showing captions when the settings cannot be read", async () => {
    const { socket, isShown } = await loadOverlay(new Error("offline"));

    socket.emit({ type: "caption", text: "Still here", at: 1 });
    expect(isShown()).toBe(true);
  });

  it("shows the typing sign while someone composes, in Spanish unless asked otherwise", async () => {
    const { socket, isTyping, typingLabel } = await loadOverlay();
    expect(typingLabel.textContent).toBe("Escribiendo");
    expect(isTyping()).toBe(false);
    socket.emit({ type: "composing", composing: true, at: 1 });
    expect(isTyping()).toBe(true);
    socket.emit({ type: "composing", composing: false, at: 2 });
    expect(isTyping()).toBe(false);

    const english = await loadOverlay({ captionsVisible: true }, "?lang=en");
    expect(english.typingLabel.textContent).toBe("Typing");
  });

  it("gives the place to a caption, and takes it back when the caption leaves while still composing", async () => {
    const { socket, isShown, isTyping } = await loadOverlay();
    socket.emit({ type: "composing", composing: true, at: 1 });
    socket.emit({ type: "caption", text: "Hola", at: 2 });
    expect(isShown()).toBe(true);
    expect(isTyping()).toBe(false);

    socket.emit({ type: "speaking", state: "end", at: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(isShown()).toBe(false);
    expect(isTyping()).toBe(true);
  });

  it("never shows the typing sign with typing=0, while captions are hidden, or after the connection drops", async () => {
    const off = await loadOverlay({ captionsVisible: true }, "?typing=0");
    off.socket.emit({ type: "composing", composing: true, at: 1 });
    expect(off.isTyping()).toBe(false);

    const hidden = await loadOverlay({ captionsVisible: false });
    hidden.socket.emit({ type: "composing", composing: true, at: 1 });
    expect(hidden.isTyping()).toBe(false);
    hidden.socket.emit({ type: "captions-visibility", visible: true, at: 2 });
    expect(hidden.isTyping()).toBe(true);

    const dropped = await loadOverlay();
    dropped.socket.emit({ type: "composing", composing: true, at: 1 });
    dropped.socket.onclose?.();
    expect(dropped.isTyping()).toBe(false);
  });

  describe("voice clips (Browser Source with \"Control audio via OBS\")", () => {
    const clip = (n: number) => ({ type: "voice-clip", id: String(n).repeat(32), url: `/api/voice/clips/${String(n).repeat(32)}.wav`, at: n });

    it("connects as an overlay so the desktop sends it the voice", async () => {
      const { socket } = await loadOverlay();
      expect(socket.url).toBe("ws://127.0.0.1:4545/ws?client=overlay");
    });

    it("plays clips one after another and reports when each starts and ends", async () => {
      const { socket } = await loadOverlay();
      socket.emit(clip(1));
      socket.emit(clip(2));
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeAudio.instances.map((audio) => audio.src)).toEqual([clip(1).url]);

      FakeAudio.instances[0]!.onplaying?.();
      FakeAudio.instances[0]!.onended?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeAudio.instances.map((audio) => audio.src)).toEqual([clip(1).url, clip(2).url]);
      FakeAudio.instances[1]!.onplaying?.();

      expect(socket.sent).toEqual([
        { type: "clip-started", id: clip(1).id },
        { type: "clip-ended", id: clip(1).id },
        { type: "clip-started", id: clip(2).id },
      ]);
    });

    it("stops the clip the desktop stops, and drops a stopped one still waiting", async () => {
      const { socket } = await loadOverlay();
      socket.emit(clip(1));
      socket.emit(clip(2));
      socket.emit(clip(3));
      await vi.advanceTimersByTimeAsync(0);
      socket.emit({ type: "voice-clip-stop", id: clip(2).id, at: 4 });
      socket.emit({ type: "voice-clip-stop", id: clip(1).id, at: 5 });
      await vi.advanceTimersByTimeAsync(0);

      expect(FakeAudio.instances[0]!.paused).toBe(true);
      expect(FakeAudio.instances[0]!.src).toBe("");
      expect(FakeAudio.instances.map((audio) => audio.src)).toEqual(["", clip(3).url]);
      expect(socket.sent).toEqual([]);
    });

    it("reports a clip it cannot play (e.g. autoplay blocked) and goes on with the next", async () => {
      const { socket } = await loadOverlay();
      FakeAudio.rejectPlay = true;
      socket.emit(clip(1));
      await vi.advanceTimersByTimeAsync(0);
      FakeAudio.rejectPlay = false;
      socket.emit(clip(2));
      await vi.advanceTimersByTimeAsync(0);
      FakeAudio.instances[1]!.onerror?.();
      await vi.advanceTimersByTimeAsync(0);

      expect(socket.sent).toEqual([
        { type: "clip-failed", id: clip(1).id },
        { type: "clip-failed", id: clip(2).id },
      ]);
    });

    it("ignores malformed clips and stops playing when the connection drops", async () => {
      const { socket } = await loadOverlay();
      socket.emit({ type: "voice-clip", id: "x", url: "https://evil.example/a.wav", at: 1 });
      socket.emit({ type: "voice-clip", id: clip(1).id, url: "https://evil.example/a.wav", at: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeAudio.instances).toEqual([]);

      socket.emit(clip(1));
      await vi.advanceTimersByTimeAsync(0);
      socket.onclose?.();
      expect(FakeAudio.instances[0]!.paused).toBe(true);
    });
  });
});
