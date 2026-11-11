import { MAX_SPEECH_QUEUE, SpeechQueueFullError } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { CommandNotFoundError } from "../src/adapters/tts/command-runner";
import {
  ProcessSpeechSynthesizer,
  SpeechEngineUnavailableError,
  type SpeechPlatform,
} from "../src/adapters/tts/process-speech-synthesizer";
import { FakeRunner } from "./fake-runner";

function fakePlatform(supportsDeviceSelection = true): SpeechPlatform {
  return {
    capabilities: { platform: "test", engine: "tts", supportsDeviceSelection },
    installHint: "Install tts.",
    buildSpeakCommand: (text, options) => [{ command: "tts", args: [options.voiceId ?? "", options.deviceId ?? "", text] }],
    buildRenderCommand: (text, _options, file) => [{ command: "render", args: [file, text] }],
    buildPlayFileCommand: (file) => [{ command: "play", args: [file] }],
    listVoices: async () => [{ id: "v", name: "V", lang: "en-US", isDefault: false }],
    listDevices: async () => [{ id: "d", name: "D" }],
  };
}

describe("ProcessSpeechSynthesizer", () => {
  it("runs the platform pipeline and resolves when it exits", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);

    const done = synthesizer.speak("Hello", { voiceId: "v", deviceId: "d" });
    expect(runner.calls[0]!.pipeline).toEqual([{ command: "tts", args: ["v", "d", "Hello"] }]);
    runner.calls[0]!.finish({ code: 0, stdout: "", stderr: "" });

    await expect(done).resolves.toBeUndefined();
  });

  it("ignores the device when the platform cannot select one", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(false), runner);

    void synthesizer.speak("Hello", { deviceId: "d" });

    expect(runner.calls[0]!.pipeline[0]!.args).toEqual(["", "", "Hello"]);
    expect(await synthesizer.listDevices()).toEqual([]);
  });

  it("kills the current utterance when a new one starts or cancel is called", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);

    const first = synthesizer.speak("One");
    const second = synthesizer.speak("Two");
    expect(runner.calls[0]!.killed).toBe(true);
    await expect(first).resolves.toBeUndefined();

    synthesizer.cancel();
    expect(runner.calls[1]!.killed).toBe(true);
    await expect(second).resolves.toBeUndefined();
  });

  it("rejects when the command fails", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);

    const done = synthesizer.speak("Hello");
    runner.calls[0]!.finish({ code: 1, stdout: "", stderr: "voice not found" });

    await expect(done).rejects.toThrow("voice not found");
  });

  it("reports a typed error with an install hint when the engine is missing", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);

    const done = synthesizer.speak("Hello");
    runner.calls[0]!.fail(new CommandNotFoundError("tts"));

    await expect(done).rejects.toBeInstanceOf(SpeechEngineUnavailableError);
    await expect(done).rejects.toThrow("Install tts.");
  });

  it("exposes capabilities and delegates listings to the platform", async () => {
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), new FakeRunner());

    expect(synthesizer.capabilities).toEqual({ platform: "test", engine: "tts", supportsDeviceSelection: true });
    expect(await synthesizer.listVoices()).toHaveLength(1);
    expect(await synthesizer.listDevices()).toEqual([{ id: "d", name: "D" }]);
  });

  const done = { code: 0, stdout: "", stderr: "" };
  const textsOf = (runner: FakeRunner) => runner.calls.map((call) => call.pipeline[0]!.args[2]);
  /** Lets the promise chain between two utterances run. */
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

  it("queues an utterance behind the current one and says them in order, each starting when its turn comes", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);
    const started: string[] = [];
    const speak = (text: string) => synthesizer.speak(text, { mode: "queue", onStart: () => started.push(text) });

    const all = [speak("One"), speak("Two"), speak("Three")];
    expect(textsOf(runner)).toEqual(["One"]);
    expect(started).toEqual(["One"]);
    expect(runner.calls[0]!.killed).toBe(false);

    runner.calls[0]!.finish(done);
    await settle();
    expect(textsOf(runner)).toEqual(["One", "Two"]);
    expect(started).toEqual(["One", "Two"]);

    runner.calls[1]!.finish(done);
    await settle();
    runner.calls[2]!.finish(done);
    await Promise.all(all);
    expect(textsOf(runner)).toEqual(["One", "Two", "Three"]);
    expect(started).toEqual(["One", "Two", "Three"]);
  });

  it("keeps the queue going after an utterance fails", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);
    const first = synthesizer.speak("One", { mode: "queue" });
    void synthesizer.speak("Two", { mode: "queue" });
    runner.calls[0]!.finish({ code: 1, stdout: "", stderr: "boom" });
    await expect(first).rejects.toThrow("boom");
    await settle();
    expect(textsOf(runner)).toEqual(["One", "Two"]);
  });

  it("drops the queue when an utterance interrupts, and when cancel is called", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);
    const started: string[] = [];
    const speak = (text: string, mode?: "queue" | "interrupt") => synthesizer.speak(text, { mode, onStart: () => started.push(text) });

    const one = speak("One");
    const two = speak("Two", "queue");
    const now = speak("Now");
    expect(runner.calls[0]!.killed).toBe(true);
    await expect(one).resolves.toBeUndefined();
    await expect(two).resolves.toBeUndefined();
    await settle();
    expect(textsOf(runner)).toEqual(["One", "Now"]);

    const later = speak("Later", "queue");
    synthesizer.cancel();
    expect(runner.calls[1]!.killed).toBe(true);
    await expect(now).resolves.toBeUndefined();
    await expect(later).resolves.toBeUndefined();
    await settle();
    expect(started).toEqual(["One", "Now"]);
    expect(textsOf(runner)).toEqual(["One", "Now"]);
  });

  it("refuses one utterance more than the queue holds", async () => {
    const runner = new FakeRunner();
    const synthesizer = new ProcessSpeechSynthesizer(fakePlatform(), runner);
    void synthesizer.speak("Speaking");
    for (let index = 0; index < MAX_SPEECH_QUEUE; index += 1) void synthesizer.speak(`Waiting ${index}`, { mode: "queue" });
    await expect(synthesizer.speak("One too many", { mode: "queue" })).rejects.toBeInstanceOf(SpeechQueueFullError);
    expect(textsOf(runner)).toEqual(["Speaking"]);
  });
});
