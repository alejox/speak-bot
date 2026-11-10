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
      { command: node, args: ["-e", "process.stdout.write(process.env.SPEAK_BOT_TEST)"], env: { SPEAK_BOT_TEST: "a;b" } },
    ]);

    expect((await running.result).stdout).toBe("a;b");
  });

  it("reports a null exit code when killed", async () => {
    const running = new NodeCommandRunner().run([{ command: node, args: ["-e", "setTimeout(() => {}, 10000)"] }]);
    running.kill();

    expect((await running.result).code).toBeNull();
  });

  it("rejects with CommandNotFoundError when the binary is missing", async () => {
    const running = new NodeCommandRunner().run([{ command: "speak-bot-missing-binary", args: [] }]);

    await expect(running.result).rejects.toBeInstanceOf(CommandNotFoundError);
  });
});
