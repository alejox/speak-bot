import type { CommandResult, RunningCommand } from "../src/adapters/tts/command-runner";
import type { VoiceClipSink } from "../src/adapters/tts/voice-clip-sink";

/** A clip sink whose overlay playbacks the test starts, finishes or fails by hand. */
export class FakeVoiceClips implements VoiceClipSink {
  connected = true;
  readonly reserved: string[] = [];
  readonly discarded: string[] = [];
  readonly plays: Array<{ file: string; killed: boolean; start: () => void; finish: (result: CommandResult) => void }> = [];

  async reserve(extension: string): Promise<string> {
    const file = `/clips/clip-${this.reserved.length + 1}.${extension}`;
    this.reserved.push(file);
    return file;
  }

  play(file: string, onStart: () => void): RunningCommand {
    let finish!: (result: CommandResult) => void;
    const result = new Promise<CommandResult>((resolve) => (finish = resolve));
    const play = { file, killed: false, start: onStart, finish };
    this.plays.push(play);
    return {
      result,
      kill: () => {
        play.killed = true;
        finish({ code: null, stdout: "", stderr: "" });
      },
    };
  }

  async discard(file: string): Promise<void> {
    this.discarded.push(file);
  }
}
