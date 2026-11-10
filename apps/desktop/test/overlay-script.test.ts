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
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

async function loadOverlay(settings: { captionsVisible?: boolean } | Error = { captionsVisible: true }) {
  const html = await readFile(OVERLAY_FILE, "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error("overlay script not found");

  FakeSocket.instances = [];
  const caption = { textContent: "", classList: new FakeClassList(), style: { setProperty: () => {} } };
  const fetchCalls: string[] = [];
  const fetchFn = async (url: string) => {
    fetchCalls.push(url);
    if (settings instanceof Error) throw settings;
    return { ok: true, json: async () => settings };
  };
  runInNewContext(script, {
    window: { location: { protocol: "http:", host: "127.0.0.1:4545", search: "?hold=1000" } },
    document: { getElementById: () => caption, body: { classList: new FakeClassList() } },
    URLSearchParams,
    WebSocket: FakeSocket,
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
  return { caption, socket, fetchCalls, isShown: () => caption.classList.contains("visible") };
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
});
