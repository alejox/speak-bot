import { describe, expect, it } from "vitest";
import { CommandNotFoundError, NodeCommandRunner } from "../src/adapters/tts/command-runner";

// Uses the running Node binary as a portable stand-in for TTS tools on every OS.
const node = process.execPath;
const echoStdin = "process.stdin.pipe(process.stdout)";
const upperCase = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s.toUpperCase()))";

describe("NodeCommandRunner", () => {
  it("feeds input to the first process and pipes each stdout into the next stdin", async () => {
    const running = new NodeCommandRunner().run([
      { command: node, args: ["-e", echoStdin], input: "hello $(whoami) `id`" },
      { command: node, args: ["-e", upperCase] },
    ]);

    expect(await running.result).toMatchObject({ code: 0, stdout: "HELLO $(WHOAMI) `ID`" });
  });

  it("passes extra environment variables without a shell", async () => {
    const running = new NodeCommandRunner().run([
      { command: node, args: ["-e", "process.stdout.write(process.env.SPEED_DECK_TEST)"], env: { SPEED_DECK_TEST: "a;b" } },
    ]);

    expect((await running.result).stdout).toBe("a;b");
  });

  it("reports a null exit code when killed", async () => {
    const running = new NodeCommandRunner().run([{ command: node, args: ["-e", "setTimeout(() => {}, 10000)"] }]);
    running.kill();

    expect((await running.result).code).toBeNull();
  });

  it("settles as a failure when a later stage exits early while an earlier one is still writing", async () => {
    const flood = "const chunk=Buffer.alloc(65536,97);(function w(){while(process.stdout.write(chunk));process.stdout.once('drain',w)})()";
    const running = new NodeCommandRunner().run([
      { command: node, args: ["-e", flood] },
      { command: node, args: ["-e", "process.exit(3)"] },
    ]);

    const result = await Promise.race([
      running.result,
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 5000)),
    ]);
    running.kill();

    expect(result).not.toBe("timeout");
    expect(result).toMatchObject({ code: 3 });
  });

  it("reports a stage killed by a signal as a failure, not a cancellation", async () => {
    const running = new NodeCommandRunner().run([{ command: node, args: ["-e", "process.kill(process.pid, 'SIGTERM')"] }]);

    const { code } = await running.result;

    expect(code).not.toBeNull();
    expect(code).not.toBe(0);
  });

  it("rejects with CommandNotFoundError when the binary is missing", async () => {
    const running = new NodeCommandRunner().run([{ command: "speed-deck-missing-binary", args: [] }]);

    await expect(running.result).rejects.toBeInstanceOf(CommandNotFoundError);
  });
});
