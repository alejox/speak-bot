import { spawn, type ChildProcess } from "node:child_process";

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
  /** Exit code of the last process, or null when it was killed. */
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
    let killed = false;
    const exits: Array<Promise<number | null>> = [];

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
          child.once("close", (code) => resolve(code));
        }),
      );
    }

    const last = children.at(-1)!;
    let stdout = "";
    let stderr = "";
    last.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    for (const child of children) child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));

    const kill = () => {
      killed = true;
      for (const child of children) if (child.exitCode === null) child.kill();
    };

    const result = Promise.all(exits).then(
      (codes) => ({ code: killed ? null : (codes.find((code) => code !== 0) ?? codes.at(-1) ?? null), stdout, stderr }),
      (error: unknown) => {
        kill();
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
