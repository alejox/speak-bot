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
});
