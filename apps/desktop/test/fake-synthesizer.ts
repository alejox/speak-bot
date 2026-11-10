import type { Voice } from "@speak-bot/core";
import type { DesktopSpeakOptions, DesktopSpeechSynthesizer } from "../src/adapters/tts/process-speech-synthesizer";

/** A speech engine that records what it was asked to say; each utterance lasts until `finishCurrent()`. */
export class FakeSynthesizer implements DesktopSpeechSynthesizer {
  readonly capabilities = { platform: "test", engine: "fake", supportsDeviceSelection: true };
  failNext: Error | undefined;
  readonly spoken: Array<{ text: string; options: DesktopSpeakOptions | undefined }> = [];
  cancelCount = 0;
  voiceListCount = 0;
  voices: Voice[] = [{ id: "Alex", name: "Alex", lang: "en-US", isDefault: false }];
  private finish: (() => void) | undefined;

  speak(text: string, options?: DesktopSpeakOptions): Promise<void> {
    this.spoken.push({ text, options });
    if (this.failNext) return Promise.reject(this.failNext);
    return new Promise((resolve) => (this.finish = resolve));
  }
  finishCurrent() {
    this.finish?.();
  }
  cancel() {
    this.cancelCount += 1;
    this.finish?.();
  }
  async listVoices(): Promise<Voice[]> {
    this.voiceListCount += 1;
    return this.voices;
  }
  async listDevices() {
    return [{ id: "BlackHole 2ch", name: "BlackHole 2ch" }];
  }
}
