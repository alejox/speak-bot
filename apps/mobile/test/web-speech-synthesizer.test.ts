import { MAX_SPEECH_QUEUE, SpeechQueueFullError } from "@speed-deck/core";
import { describe, expect, it, vi } from "vitest";
import { SpeechUnsupportedError, WebSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

const englishVoice = { voiceURI: "en-1", name: "Alex", lang: "en-US", default: true } as SpeechSynthesisVoice;
const spanishVoice = { voiceURI: "es-1", name: "Paulina", lang: "es-MX", default: false } as SpeechSynthesisVoice;

function createFakeSpeechSynthesis(initialVoices: SpeechSynthesisVoice[] = []) {
  const target = new EventTarget();
  let voices = initialVoices;
  const spoken: FakeUtterance[] = [];
  const synth = {
    speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
    cancel: vi.fn(),
    getVoices: () => voices,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  return {
    synth: synth as unknown as SpeechSynthesis,
    spoken,
    cancel: synth.cancel,
    loadVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      target.dispatchEvent(new Event("voiceschanged"));
    },
  };
}

function createSynthesizer(fake: ReturnType<typeof createFakeSpeechSynthesis>) {
  return new WebSpeechSynthesizer(fake.synth, FakeUtterance as unknown as typeof SpeechSynthesisUtterance);
}

describe("WebSpeechSynthesizer", () => {
  it("speaks with the selected voice, rate and pitch and resolves on end", async () => {
    const fake = createFakeSpeechSynthesis([englishVoice, spanishVoice]);
    const synthesizer = createSynthesizer(fake);

    const done = synthesizer.speak("Hola", { voiceId: "es-1", rate: 1.5, pitch: 0.8 });
    const utterance = fake.spoken[0]!;
    utterance.onend?.();
    await done;

    expect(utterance).toMatchObject({ text: "Hola", voice: spanishVoice, lang: "es-MX", rate: 1.5, pitch: 0.8 });
  });

  it("cancels ongoing speech before speaking", () => {
    const fake = createFakeSpeechSynthesis();
    const synthesizer = createSynthesizer(fake);

    void synthesizer.speak("Hello");

    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(fake.spoken).toHaveLength(1);
  });

  it("uses the default voice when the requested voice is missing", () => {
    const fake = createFakeSpeechSynthesis([englishVoice]);

    void createSynthesizer(fake).speak("Hello", { voiceId: "missing" });

    expect(fake.spoken[0]!.voice).toBeNull();
  });

  it("resolves when interrupted and rejects on real errors", async () => {
    const fake = createFakeSpeechSynthesis();
    const synthesizer = createSynthesizer(fake);

    const interrupted = synthesizer.speak("One");
    fake.spoken[0]!.onerror?.({ error: "interrupted" });
    await expect(interrupted).resolves.toBeUndefined();

    const failed = synthesizer.speak("Two");
    fake.spoken[1]!.onerror?.({ error: "synthesis-failed" });
    await expect(failed).rejects.toThrow("synthesis-failed");
  });

  it("reports unsupported browsers", async () => {
    const synthesizer = new WebSpeechSynthesizer(undefined, undefined);

    expect(synthesizer.isSupported).toBe(false);
    await expect(synthesizer.speak("Hello")).rejects.toBeInstanceOf(SpeechUnsupportedError);
    await expect(synthesizer.listVoices()).resolves.toEqual([]);
    expect(() => synthesizer.cancel()).not.toThrow();
  });

  it("lists voices that are already available", async () => {
    const fake = createFakeSpeechSynthesis([englishVoice]);

    await expect(createSynthesizer(fake).listVoices()).resolves.toEqual([
      { id: "en-1", name: "Alex", lang: "en-US", isDefault: true },
    ]);
  });

  it("waits for voiceschanged when voices load asynchronously", async () => {
    const fake = createFakeSpeechSynthesis();
    const synthesizer = createSynthesizer(fake);

    const voices = synthesizer.listVoices();
    fake.loadVoices([spanishVoice]);

    await expect(voices).resolves.toEqual([{ id: "es-1", name: "Paulina", lang: "es-MX", isDefault: false }]);
  });

  it("gives up waiting for voices after a timeout", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeSpeechSynthesis();
      const voices = createSynthesizer(fake).listVoices();

      await vi.advanceTimersByTimeAsync(2000);

      await expect(voices).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies voice changes until unsubscribed", () => {
    const fake = createFakeSpeechSynthesis();
    const listener = vi.fn();
    const unsubscribe = createSynthesizer(fake).onVoicesChanged(listener);

    fake.loadVoices([englishVoice]);
    unsubscribe();
    fake.loadVoices([spanishVoice]);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("queues an utterance behind the current one instead of cutting it off", async () => {
    const fake = createFakeSpeechSynthesis();
    const synthesizer = createSynthesizer(fake);

    const first = synthesizer.speak("One");
    const second = synthesizer.speak("Two", { mode: "queue" });
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(fake.spoken.map((utterance) => utterance.text)).toEqual(["One", "Two"]);

    fake.spoken[0]!.onend?.();
    await expect(first).resolves.toBeUndefined();
    fake.spoken[1]!.onend?.();
    await expect(second).resolves.toBeUndefined();
  });

  it("drops the queue when an utterance interrupts or cancel is called, settling what waited", async () => {
    const fake = createFakeSpeechSynthesis();
    const synthesizer = createSynthesizer(fake);

    const first = synthesizer.speak("One");
    const queued = synthesizer.speak("Two", { mode: "queue" });
    const now = synthesizer.speak("Now");
    expect(fake.cancel).toHaveBeenCalledTimes(2);
    // Browsers do not always report the utterances a cancel dropped.
    await expect(first).resolves.toBeUndefined();
    await expect(queued).resolves.toBeUndefined();

    const later = synthesizer.speak("Later", { mode: "queue" });
    synthesizer.cancel();
    await expect(now).resolves.toBeUndefined();
    await expect(later).resolves.toBeUndefined();
  });

  it("refuses one utterance more than the queue holds", async () => {
    const fake = createFakeSpeechSynthesis();
    const synthesizer = createSynthesizer(fake);
    void synthesizer.speak("Speaking");
    for (let index = 0; index < MAX_SPEECH_QUEUE; index += 1) void synthesizer.speak(`Waiting ${index}`, { mode: "queue" });
    await expect(synthesizer.speak("One too many", { mode: "queue" })).rejects.toBeInstanceOf(SpeechQueueFullError);
    expect(fake.spoken).toHaveLength(MAX_SPEECH_QUEUE + 1);

    fake.spoken[0]!.onend?.();
    void synthesizer.speak("Room again", { mode: "queue" });
    expect(fake.spoken).toHaveLength(MAX_SPEECH_QUEUE + 2);
  });
});
