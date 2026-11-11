import { describe, expect, it } from "vitest";
import { linuxEspeakPlatform } from "../src/adapters/tts/linux-platform";
import { macosSayPlatform } from "../src/adapters/tts/say-platform";
import { windowsSpeechPlatform } from "../src/adapters/tts/windows-platform";

const FILE = "/tmp/clips/0123456789abcdef0123456789abcdef.wav";

function decodeScript(args: readonly string[]): string {
  return Buffer.from(args[args.indexOf("-EncodedCommand") + 1]!, "base64").toString("utf16le");
}

describe("rendering an utterance to a WAV clip", () => {
  it("macOS: `say -o` writes 16-bit PCM WAV, text after --", () => {
    expect(macosSayPlatform.buildRenderCommand("-Hola", { voiceId: "Paulina", rate: 1.5, deviceId: "BlackHole 2ch" }, FILE)).toEqual([
      {
        command: "say",
        args: ["-v", "Paulina", "-r", "263", "-o", FILE, "--file-format=WAVE", "--data-format=LEI16@22050", "--", "-Hola"],
      },
    ]);
  });

  it("Linux: espeak-ng writes the WAV with -w, text through stdin", () => {
    expect(linuxEspeakPlatform.buildRenderCommand("$(reboot)", { voiceId: "es", rate: 2 }, FILE)).toEqual([
      { command: "espeak-ng", args: ["--stdin", "-w", FILE, "-v", "es", "-s", "350"], input: "$(reboot)" },
    ]);
  });

  it("Windows: System.Speech writes the WAV, every value through env vars", () => {
    const text = `'; Remove-Item C:\\ ; "$(Get-Process)"`;
    const [command, ...rest] = windowsSpeechPlatform.buildRenderCommand(text, { voiceId: "Microsoft Sabina Desktop", rate: 1 }, FILE);
    expect(rest).toEqual([]);
    expect(command!.command).toBe("powershell.exe");
    expect(Buffer.from(command!.env!.SPEED_DECK_TEXT!, "base64").toString("utf8")).toBe(text);
    expect(command!.env).toMatchObject({ SPEED_DECK_VOICE: "Microsoft Sabina Desktop", SPEED_DECK_RATE: "1", SPEED_DECK_FILE: FILE });
    const script = decodeScript(command!.args);
    expect(script).toContain("SetOutputToWaveFile($env:SPEED_DECK_FILE)");
    expect(script).not.toContain("Sabina");
    expect(script).not.toContain(FILE);
  });
});

describe("playing a rendered clip on this computer", () => {
  it("macOS: afplay on the default output, or nothing when a device is chosen (afplay cannot pick one)", () => {
    expect(macosSayPlatform.buildPlayFileCommand(FILE, {})).toEqual([{ command: "afplay", args: [FILE] }]);
    expect(macosSayPlatform.buildPlayFileCommand(FILE, { deviceId: "BlackHole 2ch" })).toBeNull();
  });

  it("Linux: paplay on the chosen sink", () => {
    expect(linuxEspeakPlatform.buildPlayFileCommand(FILE, { deviceId: "virtual_mic" })).toEqual([
      { command: "paplay", args: ["--device=virtual_mic", FILE] },
    ]);
    expect(linuxEspeakPlatform.buildPlayFileCommand(FILE, {})).toEqual([{ command: "paplay", args: [FILE] }]);
  });

  it("Windows: plays the file on the chosen render device, path and device through env vars", () => {
    const [command] = windowsSpeechPlatform.buildPlayFileCommand(FILE, { deviceId: "{0.0.0}.{abc}" })!;
    expect(command!.env).toMatchObject({ SPEED_DECK_FILE: FILE, SPEED_DECK_DEVICE: "{0.0.0}.{abc}" });
    const script = decodeScript(command!.args);
    expect(script).toContain("$env:SPEED_DECK_FILE");
    expect(script).not.toContain(FILE);
  });
});
