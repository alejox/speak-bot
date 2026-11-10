export interface Voice {
  readonly id: string;
  readonly name: string;
  readonly lang: string;
  readonly isDefault: boolean;
}

export interface SpeakOptions {
  voiceId?: string;
  /** Speaking rate, 1 is normal speed. */
  rate?: number;
  /** Voice pitch, 1 is normal pitch. */
  pitch?: number;
}

export interface SpeechSynthesizer {
  /** Resolves when the utterance finishes (or is cancelled). */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  cancel(): void;
  listVoices(): Promise<Voice[]>;
}
