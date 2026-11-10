import { describe, expect, it } from "vitest";
import { linuxEspeakPlatform, parseEspeakVoices, parsePactlSinks } from "../src/adapters/tts/linux-platform";
import { FakeRunner } from "./fake-runner";

describe("Linux espeak-ng + paplay platform", () => {
  it("pipes espeak-ng (text via stdin) into paplay on the selected sink", () => {
    const text = `$(reboot); "quoted" -v en`;
    expect(linuxEspeakPlatform.buildSpeakCommand(text, { voiceId: "es", rate: 2, deviceId: "virtual_mic" })).toEqual([
      { command: "espeak-ng", args: ["--stdin", "--stdout", "-v", "es", "-s", "350"], input: text },
      { command: "paplay", args: ["--device=virtual_mic"] },
    ]);
  });

  it("uses the default sink and voice when none are selected", () => {
    expect(linuxEspeakPlatform.buildSpeakCommand("Hi", {})).toEqual([
      { command: "espeak-ng", args: ["--stdin", "--stdout", "-s", "175"], input: "Hi" },
      { command: "paplay", args: [] },
    ]);
  });

  it("declares device selection and an install hint", () => {
    expect(linuxEspeakPlatform.capabilities).toEqual({
      platform: "linux",
      engine: "espeak-ng",
      supportsDeviceSelection: true,
    });
    expect(linuxEspeakPlatform.installHint).toMatch(/espeak-ng.*pulseaudio-utils/);
  });

  it("lists sinks with `pactl list short sinks`", async () => {
    const runner = new FakeRunner();
    const devices = linuxEspeakPlatform.listDevices(runner);
    expect(runner.calls[0]!.pipeline).toEqual([{ command: "pactl", args: ["list", "short", "sinks"] }]);
    runner.calls[0]!.finish({ code: 0, stdout: "0\talsa_output.pci\tPipeWire\ts32le 2ch 48000Hz\tSUSPENDED\n", stderr: "" });

    expect(await devices).toEqual([{ id: "alsa_output.pci", name: "alsa_output.pci" }]);
  });
});

describe("parsePactlSinks", () => {
  it("parses tab separated sink lines", () => {
    const output = [
      "47\talsa_output.pci-0000_00_1f.3.analog-stereo\tPipeWire\ts32le 2ch 48000Hz\tRUNNING",
      "52\tvirtual_mic\tPipeWire\tfloat32le 2ch 48000Hz\tIDLE\r",
      "",
    ].join("\n");

    expect(parsePactlSinks(output)).toEqual([
      { id: "alsa_output.pci-0000_00_1f.3.analog-stereo", name: "alsa_output.pci-0000_00_1f.3.analog-stereo" },
      { id: "virtual_mic", name: "virtual_mic" },
    ]);
  });
});

describe("parseEspeakVoices", () => {
  it("parses the voices table and skips the header", () => {
    const output = [
      "Pty Language       Age/Gender VoiceName          File                 Other Languages",
      " 5  af              --/M      Afrikaans          gmw/af",
      " 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)",
      "",
    ].join("\n");

    expect(parseEspeakVoices(output)).toEqual([
      { id: "af", name: "Afrikaans", lang: "af", isDefault: false },
      { id: "en-us", name: "English (America)", lang: "en-us", isDefault: false },
    ]);
  });
});
