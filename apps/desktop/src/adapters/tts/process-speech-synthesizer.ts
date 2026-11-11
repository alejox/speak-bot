import {
  MAX_SPEECH_QUEUE,
  SpeechQueueFullError,
  type AudioDevice,
  type SpeakOptions,
  type SpeechCapabilities,
  type SpeechSynthesizer,
  type Voice,
  type VoiceOutput,
} from "@speed-deck/core";
import { CommandNotFoundError, type CommandResult, type CommandRunner, type CommandSpec, type RunningCommand } from "./command-runner";
import { VOICE_CLIP_EXTENSION, type VoiceClipSink } from "./voice-clip-sink";

export interface DesktopSpeakOptions extends SpeakOptions {
  /** Output device id from listDevices(); empty or missing means the system default. */
  deviceId?: string;
  /** Called when the utterance really starts: at once, or when its turn in the queue comes. Never for one dropped while waiting. */
  onStart?: () => void;
  /** Where it is heard; "obs" and "both" need a connected clip sink, otherwise the speakers are used. */
  output?: VoiceOutput;
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
  /** Returns a pipeline that writes the spoken text to a WAV file instead of playing it. */
  buildRenderCommand(text: string, options: DesktopSpeakOptions, file: string): CommandSpec[];
  /** Returns a pipeline that plays a WAV file on the speakers, or null when it cannot use `options.deviceId`. */
  buildPlayFileCommand(file: string, options: DesktopSpeakOptions): CommandSpec[] | null;
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

const CANCELLED: CommandResult = { code: null, stdout: "", stderr: "" };

/**
 * Speaks by running a system TTS process. A new utterance (or cancel) kills the current one and empties the
 * queue, unless it asks to be queued: then it waits for its turn behind the others.
 *
 * With output "obs" or "both" and a connected clip sink, the utterance is rendered to a WAV clip that the
 * sink (the OBS overlay) plays, and with "both" this computer plays the same clip too.
 */
export class ProcessSpeechSynthesizer implements DesktopSpeechSynthesizer {
  private current: RunningCommand | undefined;
  /** Queued utterances, oldest first: each is told whether its turn came (true) or it was dropped (false). */
  private readonly waiting: Array<(turn: boolean) => void> = [];

  constructor(
    private readonly platform: SpeechPlatform,
    private readonly runner: CommandRunner,
    private readonly clips?: VoiceClipSink,
  ) {}

  get capabilities(): SpeechCapabilities {
    return this.platform.capabilities;
  }

  async speak(text: string, { onStart, output = "speakers", ...options }: DesktopSpeakOptions = {}): Promise<void> {
    if (options.mode !== "queue") {
      this.cancel();
    } else if (this.current || this.waiting.length > 0) {
      if (this.waiting.length >= MAX_SPEECH_QUEUE) throw new SpeechQueueFullError();
      const turn = await new Promise<boolean>((resolve) => this.waiting.push(resolve));
      if (!turn) return;
    }
    const speakOptions: DesktopSpeakOptions = {
      ...options,
      deviceId: this.platform.capabilities.supportsDeviceSelection ? options.deviceId : undefined,
    };
    const toClip = output !== "speakers" && this.clips?.connected === true;
    const running = toClip
      ? this.playClip(this.clips!, text, speakOptions, output === "both", onStart)
      : this.speakAloud(text, speakOptions, onStart);
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

  private speakAloud(text: string, options: DesktopSpeakOptions, onStart: (() => void) | undefined): RunningCommand {
    onStart?.();
    return this.runner.run(this.platform.buildSpeakCommand(text, options));
  }

  /**
   * Renders the text to a clip, then plays it on the sink (and here too when `alsoHere`). Starts when playback
   * does. When the sink could not play an "obs"-only clip at all, the text is spoken on the speakers instead.
   */
  private playClip(clips: VoiceClipSink, text: string, options: DesktopSpeakOptions, alsoHere: boolean, onStart: (() => void) | undefined): RunningCommand {
    let killed = false;
    let current: Pick<RunningCommand, "kill"> | undefined;
    let started = false;
    const start = () => {
      if (started || killed) return;
      started = true;
      onStart?.();
    };

    const run = async (): Promise<CommandResult> => {
      const file = await clips.reserve(VOICE_CLIP_EXTENSION);
      try {
        if (killed) return CANCELLED;
        const render = this.runner.run(this.platform.buildRenderCommand(text, options, file));
        current = render;
        const rendered = await render.result;
        if (killed) return CANCELLED;
        if (rendered.code !== 0) return rendered;

        const legs = [clips.play(file, start)];
        if (alsoHere) {
          legs.push(this.runner.run(this.platform.buildPlayFileCommand(file, options) ?? this.platform.buildSpeakCommand(text, options)));
          start();
        }
        current = { kill: () => legs.forEach((leg) => leg.kill()) };
        const results = await Promise.all(
          legs.map((leg) =>
            leg.result.catch((error: unknown) => {
              current?.kill();
              throw error;
            }),
          ),
        );
        if (killed) return CANCELLED;
        // With "both", only this computer's copy can fail the utterance: an overlay that missed it is not an error.
        if (alsoHere) return results[1]!;
        if (results[0]!.code === 0 || started) return { code: 0, stdout: "", stderr: "" };
        // No overlay played it: say it on the speakers so the person is never silent.
        const aloud = this.speakAloud(text, options, start);
        current = aloud;
        const result = await aloud.result;
        return killed ? CANCELLED : result;
      } finally {
        await clips.discard(file);
      }
    };

    return {
      result: run(),
      kill: () => {
        killed = true;
        current?.kill();
      },
    };
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
