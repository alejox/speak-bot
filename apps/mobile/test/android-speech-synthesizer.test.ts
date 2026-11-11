import { MAX_SPEECH_QUEUE, SpeechQueueFullError } from "@speed-deck/core";
import { describe, expect, it, vi } from "vitest";
import {
  AndroidSpeechSynthesizer,
  findAndroidSpeechBridge,
  type AndroidSpeechBridge,
  type AndroidSpeechEvent,
} from "../src/adapters/android-speech-synthesizer";
import { SpeechFailedError } from "../src/adapters/web-speech-synthesizer";

interface SpokenRequest {
  id: string;
  text: string;
  voiceId: string;
  rate: number;
  pitch: number;
  queue: boolean;
}

/** Stands in for the native TextToSpeech bridge the Android app injects. */
function createFakeBridge(initialVoices: unknown[] = []) {
  let voices = initialVoices;
  const spoken: SpokenRequest[] = [];
  const listeners = new Set<(event: AndroidSpeechEvent) => void>();
  let accepts = true;
  const bridge: AndroidSpeechBridge = {
    speak: (id, text, voiceId, rate, pitch, queue) => {
      if (!accepts) return false;
      spoken.push({ id, text, voiceId, rate, pitch, queue });
      return true;
    },
    cancel: vi.fn(),
    getVoices: () => JSON.stringify(voices),
  };
  const emit = (event: AndroidSpeechEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  return {
    bridge,
    spoken,
    subscribe: (listener: (event: AndroidSpeechEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
    finish: (id: string) => emit({ type: "done", id }),
    fail: (id: string, reason: string) => emit({ type: "error", id, reason }),
    loadVoices(next: unknown[]) {
      voices = next;
      emit({ type: "voices" });
    },
    refuse() {
      accepts = false;
    },
  };
}

function createSynthesizer(fake: ReturnType<typeof createFakeBridge>) {
  return new AndroidSpeechSynthesizer(fake.bridge, fake.subscribe);
}

const spanish = { id: "es-us-x-esd-local", name: "Spanish (US)", lang: "es-US", isDefault: false };
const english = { id: "en-us-x-sfg-local", name: "English (US)", lang: "en-US", isDefault: true };

describe("AndroidSpeechSynthesizer", () => {
  it("is supported", () => {
    expect(createSynthesizer(createFakeBridge()).isSupported).toBe(true);
  });

  it("speaks with the voice, rate and pitch and resolves when the engine finishes", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);
    let settled = false;

    const done = synthesizer.speak("Hola", { voiceId: spanish.id, rate: 1.5, pitch: 0.8 }).then(() => (settled = true));
    expect(fake.spoken).toEqual([{ id: expect.any(String), text: "Hola", voiceId: spanish.id, rate: 1.5, pitch: 0.8, queue: false }]);
    await Promise.resolve();
    expect(settled).toBe(false);

    fake.finish(fake.spoken[0]!.id);
    await done;
    expect(settled).toBe(true);
  });

  it("uses the default voice, rate and pitch when none is given", () => {
    const fake = createFakeBridge();
    void createSynthesizer(fake).speak("Hola");

    expect(fake.spoken[0]).toMatchObject({ voiceId: "", rate: 1, pitch: 1, queue: false });
  });

  it("interrupts: cancels and settles what is being said before speaking", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);

    const first = synthesizer.speak("One");
    const second = synthesizer.speak("Two");

    await expect(first).resolves.toBeUndefined();
    expect(fake.bridge.cancel).toHaveBeenCalledTimes(2);
    expect(fake.spoken.map((request) => request.text)).toEqual(["One", "Two"]);
    expect(fake.spoken[0]!.id).not.toBe(fake.spoken[1]!.id);
    fake.finish(fake.spoken[1]!.id);
    await second;
  });

  it("queues behind what is being said without cancelling it", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);

    const first = synthesizer.speak("One");
    const second = synthesizer.speak("Two", { mode: "queue" });

    expect(fake.bridge.cancel).toHaveBeenCalledTimes(1);
    expect(fake.spoken[1]).toMatchObject({ text: "Two", queue: true });
    fake.finish(fake.spoken[0]!.id);
    fake.finish(fake.spoken[1]!.id);
    await Promise.all([first, second]);
  });

  it("refuses a queued utterance when the queue is full", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);

    for (let index = 0; index <= MAX_SPEECH_QUEUE; index += 1) void synthesizer.speak(`Phrase ${index}`, { mode: "queue" });

    await expect(synthesizer.speak("One too many", { mode: "queue" })).rejects.toBeInstanceOf(SpeechQueueFullError);
  });

  it("cancel stops the engine and settles everything that was waiting", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);
    const first = synthesizer.speak("One");
    const second = synthesizer.speak("Two", { mode: "queue" });

    synthesizer.cancel();

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(fake.bridge.cancel).toHaveBeenCalledTimes(2);
  });

  it("rejects when the engine reports an error", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);

    const done = synthesizer.speak("Hola");
    fake.fail(fake.spoken[0]!.id, "synthesis-failed");

    await expect(done).rejects.toBeInstanceOf(SpeechFailedError);
  });

  it("rejects when the engine refuses the utterance", async () => {
    const fake = createFakeBridge();
    fake.refuse();

    await expect(createSynthesizer(fake).speak("Hola")).rejects.toBeInstanceOf(SpeechFailedError);
  });

  it("ignores events about utterances it does not know", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);
    const done = synthesizer.speak("Hola");

    fake.finish("unknown");
    fake.fail("other", "boom");
    fake.finish(fake.spoken[0]!.id);

    await expect(done).resolves.toBeUndefined();
  });

  it("lists the engine voices, dropping malformed entries", async () => {
    const fake = createFakeBridge([english, spanish, { id: 3 }, null]);

    expect(await createSynthesizer(fake).listVoices()).toEqual([english, spanish]);
  });

  it("waits briefly for the voices while the engine starts", async () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);

    const voices = synthesizer.listVoices();
    fake.loadVoices([spanish]);

    expect(await voices).toEqual([spanish]);
  });

  it("resolves with no voices when the engine never reports any", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeBridge();
      const voices = createSynthesizer(fake).listVoices();
      await vi.advanceTimersByTimeAsync(2000);

      expect(await voices).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns no voices when the bridge answers something that is not a list", async () => {
    const fake = createFakeBridge();
    fake.bridge.getVoices = () => "not json";
    vi.useFakeTimers();
    try {
      const voices = createSynthesizer(fake).listVoices();
      await vi.advanceTimersByTimeAsync(2000);
      expect(await voices).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies voice changes until unsubscribed", () => {
    const fake = createFakeBridge();
    const synthesizer = createSynthesizer(fake);
    const listener = vi.fn();

    const unsubscribe = synthesizer.onVoicesChanged(listener);
    fake.loadVoices([spanish]);
    unsubscribe();
    fake.loadVoices([english]);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("findAndroidSpeechBridge", () => {
  it("finds the bridge the Android app injected and routes its events", () => {
    const fake = createFakeBridge();
    const target: Record<string, unknown> = { SpeedDeckAndroidSpeech: fake.bridge };

    const found = findAndroidSpeechBridge(target);
    const listener = vi.fn();
    found?.subscribe(listener);
    (target.__speedDeckAndroidSpeechEvent as (event: unknown) => void)({ type: "done", id: "7" });
    (target.__speedDeckAndroidSpeechEvent as (event: unknown) => void)({ type: "bogus" });

    expect(found?.bridge).toBe(fake.bridge);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ type: "done", id: "7" });
  });

  it("finds nothing in a browser", () => {
    expect(findAndroidSpeechBridge({})).toBeUndefined();
    expect(findAndroidSpeechBridge({ SpeedDeckAndroidSpeech: { speak: "nope" } })).toBeUndefined();
  });
});

describe("createAppServices", () => {
  it("speaks through the Android bridge when the Android app provides one", async () => {
    const fake = createFakeBridge();
    const global = globalThis as Record<string, unknown>;
    global.SpeedDeckAndroidSpeech = fake.bridge;
    try {
      const { createAppServices } = await import("../src/app/composition-root");
      expect(createAppServices().synthesizer).toBeInstanceOf(AndroidSpeechSynthesizer);
    } finally {
      delete global.SpeedDeckAndroidSpeech;
      delete global.__speedDeckAndroidSpeechEvent;
    }
  });

  it("uses the Web Speech API in a browser", async () => {
    const { createAppServices } = await import("../src/app/composition-root");
    expect(createAppServices().synthesizer).not.toBeInstanceOf(AndroidSpeechSynthesizer);
  });
});
