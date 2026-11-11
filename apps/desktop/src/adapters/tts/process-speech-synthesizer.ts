import { MAX_SPEECH_QUEUE, SpeechQueueFullError, type AudioDevice, type SpeakOptions, type SpeechCapabilities, type SpeechSynthesizer, type Voice } from "@speed-deck/core";
import { CommandNotFoundError, type CommandRunner, type CommandSpec, type RunningCommand } from "./command-runner";

export interface DesktopSpeakOptions extends SpeakOptions {
  /** Output device id from listDevices(); empty or missing means the system default. */
  deviceId?: string;
  /** Called when the utterance really starts: at once, or when its turn in the queue comes. Never for one dropped while waiting. */
  onStart?: () => void;
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

/**
 * Speaks by running a system TTS process. A new utterance (or cancel) kills the current one and empties the
 * queue, unless it asks to be queued: then it waits for its turn behind the others.
 */
export class ProcessSpeechSynthesizer implements DesktopSpeechSynthesizer {
  private current: RunningCommand | undefined;
  /** Queued utterances, oldest first: each is told whether its turn came (true) or it was dropped (false). */
  private readonly waiting: Array<(turn: boolean) => void> = [];

  constructor(
    private readonly platform: SpeechPlatform,
    private readonly runner: CommandRunner,
  ) {}

  get capabilities(): SpeechCapabilities {
    return this.platform.capabilities;
  }

  async speak(text: string, { onStart, ...options }: DesktopSpeakOptions = {}): Promise<void> {
    if (options.mode !== "queue") {
      this.cancel();
    } else if (this.current || this.waiting.length > 0) {
      if (this.waiting.length >= MAX_SPEECH_QUEUE) throw new SpeechQueueFullError();
      const turn = await new Promise<boolean>((resolve) => this.waiting.push(resolve));
      if (!turn) return;
    }
    const pipeline = this.platform.buildSpeakCommand(text, {
      ...options,
      deviceId: this.platform.capabilities.supportsDeviceSelection ? options.deviceId : undefined,
    });
    onStart?.();
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
      // Still the current one (not cut off): the next in the queue takes its turn.
      if (this.current === running) {
        this.current = undefined;
        this.waiting.shift()?.(true);
      }
    }
  }

  cancel(): void {
    for (const drop of this.waiting.splice(0)) drop(false);
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
