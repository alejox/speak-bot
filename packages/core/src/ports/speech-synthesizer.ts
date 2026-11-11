export interface Voice {
  readonly id: string;
  readonly name: string;
  readonly lang: string;
  readonly isDefault: boolean;
}

/**
 * What a new utterance does to one still being spoken: "interrupt" (the default) cuts it off and empties
 * the queue; "queue" waits behind it and behind the utterances already waiting.
 */
export const SPEAK_MODES = ["queue", "interrupt"] as const;
export type SpeakMode = (typeof SPEAK_MODES)[number];

export function isSpeakMode(value: unknown): value is SpeakMode {
  return typeof value === "string" && (SPEAK_MODES as readonly string[]).includes(value);
}

/** How many utterances may wait behind the one being spoken. */
export const MAX_SPEECH_QUEUE = 20;

/** A queued utterance was refused because `MAX_SPEECH_QUEUE` are already waiting. */
export class SpeechQueueFullError extends Error {
  constructor() {
    super(`At most ${MAX_SPEECH_QUEUE} utterances can wait to be spoken.`);
    this.name = "SpeechQueueFullError";
  }
}

export interface SpeakOptions {
  voiceId?: string;
  /** Speaking rate, 1 is normal speed. */
  rate?: number;
  /** Voice pitch, 1 is normal pitch. */
  pitch?: number;
  /** "interrupt" when left out. */
  mode?: SpeakMode;
}

export interface SpeechSynthesizer {
  /**
   * Resolves when the utterance finishes (or is cancelled, also while it waits in the queue). Rejects with
   * `SpeechQueueFullError` when it is queued and the queue is full.
   */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  /** Stops the current utterance and empties the queue. */
  cancel(): void;
  listVoices(): Promise<Voice[]>;
}
