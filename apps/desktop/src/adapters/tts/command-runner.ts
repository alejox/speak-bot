import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:os";

/** One process to start. Arguments go straight to the OS (no shell), so text can never be interpreted as code. */
export interface CommandSpec {
  readonly command: string;
  readonly args: readonly string[];
  /** Written to the process stdin, then stdin is closed. */
  readonly input?: string;
  /** Extra environment variables, merged over the current environment. */
  readonly env?: Readonly<Record<string, string>>;
}

export interface CommandResult {
  /**
   * Exit code of the first failing process (or of the last one when all succeeded), or null only when
   * the pipeline was cancelled with `kill()`. A process killed by a signal reports 128 + the signal number.
   */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunningCommand {
  /** Resolves when every process exited; rejects with CommandNotFoundError when a binary is missing. */
  readonly result: Promise<CommandResult>;
  kill(): void;
}

/**
 * Runs a pipeline of processes: the stdout of each one feeds the stdin of the next.
 * A single-element pipeline is just one process.
 */
export interface CommandRunner {
  run(pipeline: readonly CommandSpec[]): RunningCommand;
}

export class CommandNotFoundError extends Error {
  constructor(readonly command: string) {
    super(`Command not found: ${command}`);
    this.name = "CommandNotFoundError";
  }
}

/** Runs commands with child_process.spawn and `shell: false`. */
export class NodeCommandRunner implements CommandRunner {
  run(pipeline: readonly CommandSpec[]): RunningCommand {
    if (pipeline.length === 0) throw new Error("A pipeline needs at least one command.");

    const children: ChildProcess[] = [];
    let cancelled = false;
    let failureCode: number | undefined;
    const exits: Array<Promise<number>> = [];

    const stopAll = () => {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    };

    for (const [index, spec] of pipeline.entries()) {
      const isFirst = index === 0;
      const child = spawn(spec.command, [...spec.args], {
        shell: false,
        windowsHide: true,
        env: spec.env ? { ...process.env, ...spec.env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const previous = children.at(-1);
      if (previous?.stdout && child.stdin) previous.stdout.pipe(child.stdin);
      else if (isFirst && child.stdin) {
        child.stdin.on("error", () => {});
        child.stdin.end(spec.input ?? "");
      }
      child.stdin?.on("error", () => {});
      children.push(child);
      exits.push(
        new Promise((resolve, reject) => {
          child.once("error", (error: NodeJS.ErrnoException) =>
            reject(error.code === "ENOENT" ? new CommandNotFoundError(spec.command) : error),
          );
          child.once("close", (code, signal) => {
            const exitCode = code ?? 128 + (signal ? (constants.signals[signal] ?? 0) : 0);
            // When one stage fails, stop the others: an upstream stage would otherwise block
            // forever on a full stdout pipe that nobody reads.
            if (exitCode !== 0 && failureCode === undefined && !cancelled) {
              failureCode = exitCode;
              stopAll();
            }
            resolve(exitCode);
          });
        }),
      );
    }

    const last = children.at(-1)!;
    let stdout = "";
    let stderr = "";
    last.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    for (const child of children) child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));

    const kill = () => {
      if (failureCode === undefined) cancelled = true;
      stopAll();
    };

    const result = Promise.all(exits).then(
      (codes) => ({ code: cancelled ? null : (failureCode ?? codes.at(-1) ?? 0), stdout, stderr }),
      (error: unknown) => {
        stopAll();
        throw error;
      },
    );
    return { result, kill };
  }
}

/** Runs a single command and returns its stdout, or an empty string when it fails. Used for listings. */
export async function readCommandOutput(runner: CommandRunner, spec: CommandSpec): Promise<string> {
  try {
    const { code, stdout } = await runner.run([spec]).result;
    return code === 0 ? stdout : "";
  } catch {
    return "";
  }
}
