import { describe, expect, it } from "vitest";
import { macosSayPlatform, parseSayDevices, parseSayVoices } from "../src/adapters/tts/say-platform";
import { FakeRunner } from "./fake-runner";

describe("macOS say platform", () => {
  it("passes the text as a single argv entry after --, never through a shell", () => {
    const text = `-v "; rm -rf ~ $(whoami) \`id\``;
    expect(macosSayPlatform.buildSpeakCommand(text, {})).toEqual([{ command: "say", args: ["--", text] }]);
  });

  it("maps voice, rate multiplier (words per minute) and output device", () => {
    expect(
      macosSayPlatform.buildSpeakCommand("Hi", { voiceId: "Eddy (English (US))", rate: 1.5, deviceId: "BlackHole 2ch" }),
    ).toEqual([{ command: "say", args: ["-v", "Eddy (English (US))", "-r", "263", "-a", "BlackHole 2ch", "--", "Hi"] }]);
  });

  it("supports device selection", () => {
    expect(macosSayPlatform.capabilities).toEqual({ platform: "darwin", engine: "say", supportsDeviceSelection: true });
  });

  it("lists voices and devices with `say -v ?` and `say -a ?`", async () => {
    const runner = new FakeRunner();
    const voices = macosSayPlatform.listVoices(runner);
    const devices = macosSayPlatform.listDevices(runner);
    expect(runner.calls.map((c) => c.pipeline)).toEqual([
      [{ command: "say", args: ["-v", "?"] }],
      [{ command: "say", args: ["-a", "?"] }],
    ]);
    runner.calls[0]!.finish({ code: 0, stdout: "Albert              en_US    # Hello!\n", stderr: "" });
    runner.calls[1]!.finish({ code: 0, stdout: "   77 BlackHole 2ch\n", stderr: "" });

    expect(await voices).toEqual([{ id: "Albert", name: "Albert", lang: "en-US", isDefault: false }]);
    expect(await devices).toEqual([{ id: "BlackHole 2ch", name: "BlackHole 2ch" }]);
  });
});

describe("parseSayVoices", () => {
  it("parses names with spaces and parentheses and normalises the language tag", () => {
    const output = [
      "Albert              en_US    # Hello! My name is Albert.",
      "Eddy (English (US)) en_US    # Hello! My name is Eddy.",
      "Grandma (Alemán (Alemania)) de_DE    # Hallo! Ich heiße Grandma.\r",
      "",
      "garbage line",
    ].join("\n");

    expect(parseSayVoices(output)).toEqual([
      { id: "Albert", name: "Albert", lang: "en-US", isDefault: false },
      { id: "Eddy (English (US))", name: "Eddy (English (US))", lang: "en-US", isDefault: false },
      { id: "Grandma (Alemán (Alemania))", name: "Grandma (Alemán (Alemania))", lang: "de-DE", isDefault: false },
    ]);
  });
});

describe("parseSayDevices", () => {
  it("uses the device name as a stable id", () => {
    const output = "   84 MacBook Pro Speakers\n   77 BlackHole 2ch\n\n";

    expect(parseSayDevices(output)).toEqual([
      { id: "MacBook Pro Speakers", name: "MacBook Pro Speakers" },
      { id: "BlackHole 2ch", name: "BlackHole 2ch" },
    ]);
  });
});
