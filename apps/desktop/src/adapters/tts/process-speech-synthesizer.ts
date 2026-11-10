import type { AudioDevice, SpeakOptions, SpeechCapabilities, SpeechSynthesizer, Voice } from "@speak-bot/core";
import { CommandNotFoundError, type CommandRunner, type CommandSpec, type RunningCommand } from "./command-runner";

export interface DesktopSpeakOptions extends SpeakOptions {
  /** Output device id from listDevices(); empty or missing means the system default. */
  deviceId?: string;
}

/** The core speech port plus what only a desktop can do: pick an output device. */
export interface DesktopSpeechSynthesizer extends SpeechSynthesizer {
  speak(text: string, options?: DesktopSpeakOptions): Promise<void>;
  listDevices(): Promise<AudioDevice[]>;
  readonly capabilities: SpeechCapabilities;
}

/** Everything that differs between operating systems. */
export interface SpeechPlatform {
  readonly capabilities: SpeechCapabilities;
  /** Message shown when a required binary is missing. */
  readonly installHint: string;
  /** Returns a pipeline (usually a single command) that speaks the text. */
  buildSpeakCommand(text: string, options: DesktopSpeakOptions): CommandSpec[];
  listVoices(runner: CommandRunner): Promise<Voice[]>;
  listDevices(runner: CommandRunner): Promise<AudioDevice[]>;
}

export class SpeechEngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechEngineUnavailableError";
  }
}

export class SpeechCommandFailedError extends Error {
  constructor(detail: string) {
    super(`Speech failed: ${detail}`);
    this.name = "SpeechCommandFailedError";
  }
}

/** Speaks by running a system TTS process. A new utterance (or cancel) kills the current one. */
export class ProcessSpeechSynthesizer implements DesktopSpeechSynthesizer {
  private current: RunningCommand | undefined;

  constructor(
    private readonly platform: SpeechPlatform,
    private readonly runner: CommandRunner,
  ) {}

  get capabilities(): SpeechCapabilities {
    return this.platform.capabilities;
  }

  async speak(text: string, options: DesktopSpeakOptions = {}): Promise<void> {
    this.cancel();
    const pipeline = this.platform.buildSpeakCommand(text, {
      ...options,
      deviceId: this.platform.capabilities.supportsDeviceSelection ? options.deviceId : undefined,
    });
    const running = this.runner.run(pipeline);
    this.current = running;
    try {
      const { code, stderr } = await running.result;
      // A null code means the process was killed by cancel(), which is not a failure.
      if (code !== null && code !== 0) throw new SpeechCommandFailedError(stderr.trim() || `exit code ${code}`);
    } catch (error) {
      if (error instanceof CommandNotFoundError) {
        throw new SpeechEngineUnavailableError(`${error.message}. ${this.platform.installHint}`);
      }
      throw error;
    } finally {
      if (this.current === running) this.current = undefined;
    }
  }

  cancel(): void {
    this.current?.kill();
    this.current = undefined;
  }

  listVoices(): Promise<Voice[]> {
    return this.platform.listVoices(this.runner).catch(() => []);
  }

  listDevices(): Promise<AudioDevice[]> {
    if (!this.platform.capabilities.supportsDeviceSelection) return Promise.resolve([]);
    return this.platform.listDevices(this.runner).catch(() => []);
  }
}

/** Default speaking rate of most system engines, in words per minute. */
export const NORMAL_WORDS_PER_MINUTE = 175;

export function rateToWordsPerMinute(rate: number | undefined): number {
  return Math.round(NORMAL_WORDS_PER_MINUTE * (rate ?? 1));
}
