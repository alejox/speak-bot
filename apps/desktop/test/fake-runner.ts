import type { CommandResult, CommandRunner, CommandSpec, RunningCommand } from "../src/adapters/tts/command-runner";

/** Records pipelines instead of starting processes; tests finish, fail or kill them by hand. */
export class FakeRunner implements CommandRunner {
  readonly calls: Array<{
    pipeline: readonly CommandSpec[];
    killed: boolean;
    finish: (result: CommandResult) => void;
    fail: (error: Error) => void;
  }> = [];

  run(pipeline: readonly CommandSpec[]): RunningCommand {
    let finish!: (result: CommandResult) => void;
    let fail!: (error: Error) => void;
    const result = new Promise<CommandResult>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const call = { pipeline, killed: false, finish, fail };
    this.calls.push(call);
    return {
      result,
      kill: () => {
        call.killed = true;
        finish({ code: null, stdout: "", stderr: "" });
      },
    };
  }
}
