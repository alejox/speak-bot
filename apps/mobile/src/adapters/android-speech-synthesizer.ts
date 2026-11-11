import { MAX_SPEECH_QUEUE, SpeechQueueFullError, type SpeakOptions, type Voice } from "@speed-deck/core";
import { SpeechFailedError, type AppSpeechSynthesizer } from "./web-speech-synthesizer";

/** What the Android app reports about speech, through `window.__speedDeckAndroidSpeechEvent`. */
export type AndroidSpeechEvent = { type: "done"; id: string } | { type: "error"; id: string; reason: string } | { type: "voices" };

/**
 * The native TextToSpeech bridge the Android app injects as `window.SpeedDeckAndroidSpeech` when it
 * shows the app bundled in the APK (Android's WebView has no speechSynthesis).
 */
export interface AndroidSpeechBridge {
  /** Starts (or queues) an utterance; false when the engine refused it. `voiceId` "" is the default voice. */
  speak(id: string, text: string, voiceId: string, rate: number, pitch: number, queue: boolean): boolean;
  /** Stops what is being said and empties the queue. */
  cancel(): void;
  /** JSON array of voices: `{ id, name, lang, isDefault }`. */
  getVoices(): string;
}

export type AndroidSpeechSubscribe = (listener: (event: AndroidSpeechEvent) => void) => () => void;

const BRIDGE_NAME = "SpeedDeckAndroidSpeech";
const EVENT_CALLBACK_NAME = "__speedDeckAndroidSpeechEvent";
const VOICES_TIMEOUT_MS = 2000;

interface Pending {
  resolve(): void;
  reject(error: Error): void;
}

/** Speaks through Android's TextToSpeech engine, via the bridge the Android app injects. */
export class AndroidSpeechSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  /** Utterances handed to the engine and not finished yet: the one being said and those queued behind it. */
  private readonly unfinished = new Map<string, Pending>();
  private nextId = 1;

  constructor(
    private readonly bridge: AndroidSpeechBridge,
    private readonly subscribe: AndroidSpeechSubscribe,
  ) {
    subscribe((event) => {
      if (event.type === "voices") return;
      const pending = this.unfinished.get(event.id);
      if (!pending) return;
      this.unfinished.delete(event.id);
      if (event.type === "done") pending.resolve();
      else pending.reject(new SpeechFailedError(event.reason));
    });
  }

  /** A queued utterance joins the engine's queue; any other replaces whatever is being said or waiting. */
  speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const queued = options.mode === "queue";
    // One being said plus a full queue behind it.
    if (queued && this.unfinished.size > MAX_SPEECH_QUEUE) return Promise.reject(new SpeechQueueFullError());
    if (!queued) this.cancel();

    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.unfinished.set(id, { resolve, reject });
      const accepted = this.bridge.speak(id, text, options.voiceId ?? "", options.rate ?? 1, options.pitch ?? 1, queued);
      if (!accepted && this.unfinished.delete(id)) reject(new SpeechFailedError("the speech engine is not available"));
    });
  }

  /** Stops speaking and empties the queue. Settled here: the engine does not always report dropped utterances. */
  cancel(): void {
    const dropped = [...this.unfinished.values()];
    this.unfinished.clear();
    for (const pending of dropped) pending.resolve();
    this.bridge.cancel();
  }

  /** Resolves with the engine voices, waiting briefly while the engine starts. */
  listVoices(): Promise<Voice[]> {
    const current = this.readVoices();
    if (current.length > 0) return Promise.resolve(current);
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        resolve(this.readVoices());
      };
      const timer = setTimeout(finish, VOICES_TIMEOUT_MS);
      const unsubscribe = this.subscribe((event) => {
        if (event.type === "voices") finish();
      });
    });
  }

  onVoicesChanged(listener: () => void): () => void {
    return this.subscribe((event) => {
      if (event.type === "voices") listener();
    });
  }

  private readVoices(): Voice[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.bridge.getVoices());
    } catch {
      return [];
    }
    return Array.isArray(parsed) ? parsed.filter(isVoice).map(({ id, name, lang, isDefault }) => ({ id, name, lang, isDefault })) : [];
  }
}

/**
 * The Android bridge, when this page runs inside the Speed Deck Android app, with a way to listen to
 * its events. Installs the global callback the app calls with each event.
 */
export function findAndroidSpeechBridge(target: object = globalThis): { bridge: AndroidSpeechBridge; subscribe: AndroidSpeechSubscribe } | undefined {
  const host = target as Record<string, unknown>;
  const bridge = host[BRIDGE_NAME];
  if (!isBridge(bridge)) return undefined;

  const listeners = new Set<(event: AndroidSpeechEvent) => void>();
  host[EVENT_CALLBACK_NAME] = (event: unknown) => {
    if (!isEvent(event)) return;
    for (const listener of [...listeners]) listener(event);
  };
  return {
    bridge,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function isBridge(value: unknown): value is AndroidSpeechBridge {
  if (typeof value !== "object" || value === null) return false;
  const { speak, cancel, getVoices } = value as Record<string, unknown>;
  return typeof speak === "function" && typeof cancel === "function" && typeof getVoices === "function";
}

function isEvent(value: unknown): value is AndroidSpeechEvent {
  if (typeof value !== "object" || value === null) return false;
  const { type, id, reason } = value as Record<string, unknown>;
  if (type === "voices") return true;
  if (type === "done") return typeof id === "string";
  return type === "error" && typeof id === "string" && typeof reason === "string";
}

function isVoice(value: unknown): value is Voice {
  if (typeof value !== "object" || value === null) return false;
  const { id, name, lang, isDefault } = value as Record<string, unknown>;
  return typeof id === "string" && typeof name === "string" && typeof lang === "string" && typeof isDefault === "boolean";
}
