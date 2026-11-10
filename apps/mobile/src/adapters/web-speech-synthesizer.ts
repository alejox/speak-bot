import type { SpeakOptions, SpeechSynthesizer, Voice } from "@speak-bot/core";

export class SpeechUnsupportedError extends Error {
  constructor() {
    super("Speech is not supported on this device or browser.");
    this.name = "SpeechUnsupportedError";
  }
}

export class SpeechFailedError extends Error {
  constructor(reason: string) {
    super(`Speech failed: ${reason}`);
    this.name = "SpeechFailedError";
  }
}

/** Speech synthesizer used by the app, with extra browser concerns on top of the core port. */
export interface AppSpeechSynthesizer extends SpeechSynthesizer {
  readonly isSupported: boolean;
  /** Notifies when the available voices change. Returns an unsubscribe function. */
  onVoicesChanged(listener: () => void): () => void;
}

type UtteranceConstructor = new (text: string) => SpeechSynthesisUtterance;

const VOICES_TIMEOUT_MS = 2000;

/** Adapter over the Web Speech API (window.speechSynthesis). Works offline with system voices. */
export class WebSpeechSynthesizer implements AppSpeechSynthesizer {
  private readonly synth: SpeechSynthesis | undefined;
  private readonly Utterance: UtteranceConstructor | undefined;

  constructor(
    synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
    Utterance: UtteranceConstructor | undefined = globalThis.SpeechSynthesisUtterance,
  ) {
    this.synth = synth;
    this.Utterance = Utterance;
  }

  get isSupported(): boolean {
    return this.synth !== undefined && this.Utterance !== undefined;
  }

  /**
   * Calls speechSynthesis.speak synchronously so it runs inside the user's tap,
   * which mobile browsers (notably iOS Safari) require.
   */
  speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const { synth, Utterance } = this;
    if (!synth || !Utterance) return Promise.reject(new SpeechUnsupportedError());

    return new Promise((resolve, reject) => {
      const utterance = new Utterance(text);
      const voice = options.voiceId ? synth.getVoices().find((v) => v.voiceURI === options.voiceId) : undefined;
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      if (options.rate !== undefined) utterance.rate = options.rate;
      if (options.pitch !== undefined) utterance.pitch = options.pitch;

      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        // Being cut off by cancel() or a newer utterance is not a failure.
        if (event.error === "canceled" || event.error === "interrupted") resolve();
        else reject(new SpeechFailedError(event.error));
      };

      // A new utterance replaces whatever is still being spoken.
      synth.cancel();
      synth.speak(utterance);
    });
  }

  cancel(): void {
    this.synth?.cancel();
  }

  /** Resolves with the system voices, waiting briefly for browsers that load them asynchronously. */
  listVoices(): Promise<Voice[]> {
    const synth = this.synth;
    if (!synth) return Promise.resolve([]);

    const current = synth.getVoices();
    if (current.length > 0) return Promise.resolve(current.map(toVoice));

    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        synth.removeEventListener("voiceschanged", finish);
        resolve(synth.getVoices().map(toVoice));
      };
      const timer = setTimeout(finish, VOICES_TIMEOUT_MS);
      synth.addEventListener("voiceschanged", finish);
    });
  }

  onVoicesChanged(listener: () => void): () => void {
    const synth = this.synth;
    if (!synth) return () => {};
    synth.addEventListener("voiceschanged", listener);
    return () => synth.removeEventListener("voiceschanged", listener);
  }
}

function toVoice(voice: SpeechSynthesisVoice): Voice {
  return { id: voice.voiceURI, name: voice.name, lang: voice.lang, isDefault: voice.default };
}
