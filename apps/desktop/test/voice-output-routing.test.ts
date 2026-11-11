import { describe, expect, it } from "vitest";
import { ProcessSpeechSynthesizer, SpeechCommandFailedError, type SpeechPlatform } from "../src/adapters/tts/process-speech-synthesizer";
import { FakeRunner } from "./fake-runner";
import { FakeVoiceClips } from "./fake-voice-clips";

const OK = { code: 0, stdout: "", stderr: "" };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function platform(playFile: "afplay" | "none" = "afplay"): SpeechPlatform {
  return {
    capabilities: { platform: "test", engine: "tts", supportsDeviceSelection: true },
    installHint: "Install tts.",
    buildSpeakCommand: (text) => [{ command: "speak", args: [text] }],
    buildRenderCommand: (text, _options, file) => [{ command: "render", args: [file, text] }],
    buildPlayFileCommand: (file) => (playFile === "none" ? null : [{ command: "play", args: [file] }]),
    listVoices: async () => [],
    listDevices: async () => [],
  };
}

function setup(playFile: "afplay" | "none" = "afplay") {
  const runner = new FakeRunner();
  const clips = new FakeVoiceClips();
  const synthesizer = new ProcessSpeechSynthesizer(platform(playFile), runner, clips);
  const commands = () => runner.calls.map((call) => call.pipeline[0]!.command);
  return { runner, clips, synthesizer, commands };
}

describe("voice output routing", () => {
  it("speaks on the speakers by default, without rendering a clip", async () => {
    const { synthesizer, clips, commands, runner } = setup();
    const done = synthesizer.speak("Hola");
    expect(commands()).toEqual(["speak"]);
    runner.calls[0]!.finish(OK);
    await done;
    expect(clips.reserved).toEqual([]);
  });

  it("obs: renders a clip, plays it only on the overlay and starts when the overlay does", async () => {
    const { synthesizer, clips, commands, runner } = setup();
    let started = 0;
    const done = synthesizer.speak("Hola", { output: "obs", onStart: () => (started += 1) });
    await flush();
    expect(runner.calls[0]!.pipeline).toEqual([{ command: "render", args: ["/clips/clip-1.wav", "Hola"] }]);
    runner.calls[0]!.finish(OK);
    await flush();
    expect(clips.plays.map((play) => play.file)).toEqual(["/clips/clip-1.wav"]);
    expect(started).toBe(0);
    clips.plays[0]!.start();
    expect(started).toBe(1);
    clips.plays[0]!.finish(OK);
    await done;
    expect(commands()).toEqual(["render"]);
    expect(clips.discarded).toEqual(["/clips/clip-1.wav"]);
  });

  it("obs without a connected overlay: speaks on the speakers instead", async () => {
    const { synthesizer, clips, commands } = setup();
    clips.connected = false;
    void synthesizer.speak("Hola", { output: "obs" });
    await flush();
    expect(commands()).toEqual(["speak"]);
    expect(clips.reserved).toEqual([]);
  });

  it("obs: falls back to the speakers when no overlay could play the clip", async () => {
    const { synthesizer, clips, commands, runner } = setup();
    const done = synthesizer.speak("Hola", { output: "obs" });
    await flush();
    runner.calls[0]!.finish(OK);
    await flush();
    clips.plays[0]!.finish({ code: 1, stdout: "", stderr: "No overlay played the clip." });
    await flush();
    expect(commands()).toEqual(["render", "speak"]);
    runner.calls[1]!.finish(OK);
    await expect(done).resolves.toBeUndefined();
  });

  it("both: plays the same clip on the overlay and on this computer, done when both finished", async () => {
    const { synthesizer, clips, commands, runner } = setup();
    let started = 0;
    let finished = false;
    const done = synthesizer.speak("Hola", { output: "both", onStart: () => (started += 1) }).then(() => (finished = true));
    await flush();
    runner.calls[0]!.finish(OK);
    await flush();
    expect(commands()).toEqual(["render", "play"]);
    expect(runner.calls[1]!.pipeline[0]!.args).toEqual(["/clips/clip-1.wav"]);
    expect(started).toBe(1);
    clips.plays[0]!.start();
    expect(started).toBe(1);
    runner.calls[1]!.finish(OK);
    await flush();
    expect(finished).toBe(false);
    clips.plays[0]!.finish(OK);
    await done;
  });

  it("both: speaks the text on this computer when the platform cannot play the file on the chosen device", async () => {
    const { synthesizer, commands, runner } = setup("none");
    void synthesizer.speak("Hola", { output: "both", deviceId: "BlackHole 2ch" });
    await flush();
    runner.calls[0]!.finish(OK);
    await flush();
    expect(commands()).toEqual(["render", "speak"]);
  });

  it("cancel cuts the overlay clip (and the local copy) and discards the file", async () => {
    const { synthesizer, clips, runner } = setup();
    const done = synthesizer.speak("Hola", { output: "both" });
    await flush();
    runner.calls[0]!.finish(OK);
    await flush();
    synthesizer.cancel();
    expect(clips.plays[0]!.killed).toBe(true);
    expect(runner.calls[1]!.killed).toBe(true);
    await expect(done).resolves.toBeUndefined();
    expect(clips.discarded).toEqual(["/clips/clip-1.wav"]);
  });

  it("cancel while rendering never sends the clip", async () => {
    const { synthesizer, clips, runner } = setup();
    let started = false;
    const done = synthesizer.speak("Hola", { output: "obs", onStart: () => (started = true) });
    await flush();
    synthesizer.cancel();
    expect(runner.calls[0]!.killed).toBe(true);
    await done;
    expect(clips.plays).toEqual([]);
    expect(started).toBe(false);
    expect(clips.discarded).toEqual(["/clips/clip-1.wav"]);
  });

  it("a queued utterance waits until the overlay reports the clip before it ended", async () => {
    const { synthesizer, clips, runner, commands } = setup();
    const first = synthesizer.speak("One", { output: "obs" });
    await flush();
    const second = synthesizer.speak("Two", { output: "obs", mode: "queue" });
    runner.calls[0]!.finish(OK);
    await flush();
    clips.plays[0]!.start();
    await flush();
    expect(commands()).toEqual(["render"]);
    clips.plays[0]!.finish(OK);
    await first;
    await flush();
    expect(runner.calls[1]!.pipeline[0]!.args).toEqual(["/clips/clip-2.wav", "Two"]);
    runner.calls[1]!.finish(OK);
    await flush();
    clips.plays[1]!.finish(OK);
    await second;
  });

  it("rejects when rendering fails, and discards the file", async () => {
    const { synthesizer, clips, runner } = setup();
    const done = synthesizer.speak("Hola", { output: "obs" });
    await flush();
    runner.calls[0]!.finish({ code: 1, stdout: "", stderr: "bad voice" });
    await expect(done).rejects.toBeInstanceOf(SpeechCommandFailedError);
    expect(clips.discarded).toEqual(["/clips/clip-1.wav"]);
  });
});
