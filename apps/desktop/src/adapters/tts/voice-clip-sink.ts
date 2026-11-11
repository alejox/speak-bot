import type { RunningCommand } from "./command-runner";

/** Every platform renders clips as 16-bit PCM WAV, which OBS's browser (Chromium) plays. */
export const VOICE_CLIP_EXTENSION = "wav";

/**
 * Where rendered voice clips are played instead of (or besides) the speakers: the OBS overlay, which OBS
 * mixes as its own audio source.
 */
export interface VoiceClipSink {
  /** True while something can play clips; otherwise the voice goes to the speakers. */
  readonly connected: boolean;
  /** A fresh, unguessable path for a clip with this extension, inside the sink's own folder. */
  reserve(extension: string): Promise<string>;
  /**
   * Plays a rendered clip. `onStart` runs once, when playback really starts. The result's code is 0 once it
   * finished, null when killed, and non-zero when nothing could play it.
   */
  play(file: string, onStart: () => void): RunningCommand;
  /** Deletes a clip file; never throws. */
  discard(file: string): Promise<void>;
}
