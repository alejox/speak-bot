import type { Voice } from "@speed-deck/core";
import type { DesktopSpeakOptions, DesktopSpeechSynthesizer } from "../src/adapters/tts/process-speech-synthesizer";

/**
 * A speech engine that records what it started saying (without the `onStart` callback); each utterance
 * lasts until `finishCurrent()`. Like the real one, a queued utterance waits for its turn and anything else
 * (or `cancel`) drops the current one and the queue.
 */
export class FakeSynthesizer implements DesktopSpeechSynthesizer {
  readonly capabilities = { platform: "test", engine: "fake", supportsDeviceSelection: true };
  failNext: Error | undefined;
  readonly spoken: Array<{ text: string; options: DesktopSpeakOptions | undefined }> = [];
  cancelCount = 0;
  voiceListCount = 0;
  voices: Voice[] = [{ id: "Alex", name: "Alex", lang: "en-US", isDefault: false }];
  private finish: (() => void) | undefined;
  private waiting: Array<(turn: boolean) => void> = [];

  async speak(text: string, options?: DesktopSpeakOptions): Promise<void> {
    if (options?.mode === "queue" && (this.finish || this.waiting.length > 0)) {
      if (!(await new Promise<boolean>((resolve) => this.waiting.push(resolve)))) return;
    } else if (options?.mode !== "queue") {
      this.drop();
    }
    const { onStart, ...recorded } = options ?? {};
    this.spoken.push({ text, options: options ? recorded : undefined });
    onStart?.();
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      throw error;
    }
    await new Promise<void>((resolve) => (this.finish = resolve));
  }
  finishCurrent() {
    const finish = this.finish;
    this.finish = undefined;
    finish?.();
    this.waiting.shift()?.(true);
  }
  cancel() {
    this.cancelCount += 1;
    this.drop();
  }
  private drop() {
    for (const skip of this.waiting.splice(0)) skip(false);
    const finish = this.finish;
    this.finish = undefined;
    finish?.();
  }
  async listVoices(): Promise<Voice[]> {
    this.voiceListCount += 1;
    return this.voices;
  }
  async listDevices() {
    return [{ id: "BlackHole 2ch", name: "BlackHole 2ch" }];
  }
}
