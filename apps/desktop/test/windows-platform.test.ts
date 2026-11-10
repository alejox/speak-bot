import { describe, expect, it } from "vitest";
import { parseWindowsJsonList, windowsSpeechPlatform } from "../src/adapters/tts/windows-platform";
import { FakeRunner } from "./fake-runner";

function decodeScript(args: readonly string[]): string {
  const index = args.indexOf("-EncodedCommand");
  return Buffer.from(args[index + 1]!, "base64").toString("utf16le");
}

describe("Windows speech platform", () => {
  it("passes text and options through env vars, never inside the script", () => {
    const text = `'; Remove-Item -Recurse C:\\ ; "$(Get-Process)" ñ`;
    const [command, ...rest] = windowsSpeechPlatform.buildSpeakCommand(text, {
      voiceId: "Microsoft Zira Desktop",
      rate: 2,
      deviceId: "{0.0.0.00000000}.{abc}",
    });

    expect(rest).toEqual([]);
    expect(command!.command).toBe("powershell.exe");
    expect(command!.args.slice(0, 4)).toEqual(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]);
    expect(Buffer.from(command!.env!.SPEED_DECK_TEXT!, "base64").toString("utf8")).toBe(text);
    expect(command!.env).toMatchObject({
      SPEED_DECK_VOICE: "Microsoft Zira Desktop",
      SPEED_DECK_RATE: "2",
      SPEED_DECK_DEVICE: "{0.0.0.00000000}.{abc}",
    });

    const script = decodeScript(command!.args);
    expect(script).not.toContain("Zira");
    expect(script).not.toContain("Remove-Item");
    expect(script).toContain("$env:SPEED_DECK_TEXT");
    expect(script).toContain("Windows.Media.Playback.MediaPlayer");
    expect(script).toContain("SetOutputToDefaultAudioDevice");
  });

  it("uses default voice, rate and device when no options are given", () => {
    expect(windowsSpeechPlatform.buildSpeakCommand("Hi", {})[0]!.env).toMatchObject({
      SPEED_DECK_VOICE: "",
      SPEED_DECK_RATE: "1",
      SPEED_DECK_DEVICE: "",
    });
  });

  it("declares device selection through WinRT", () => {
    expect(windowsSpeechPlatform.capabilities).toEqual({
      platform: "win32",
      engine: "windows-speech",
      supportsDeviceSelection: true,
    });
  });

  it("lists voices and render devices from the JSON printed by PowerShell", async () => {
    const runner = new FakeRunner();
    const voices = windowsSpeechPlatform.listVoices(runner);
    const devices = windowsSpeechPlatform.listDevices(runner);
    expect(decodeScript(runner.calls[0]!.pipeline[0]!.args)).toContain("GetInstalledVoices");
    expect(decodeScript(runner.calls[1]!.pipeline[0]!.args)).toContain("GetAudioRenderSelector");

    runner.calls[0]!.finish({
      code: 0,
      stdout: '[{"id":"Microsoft David Desktop","name":"Microsoft David Desktop","lang":"en-US"}]\r\n',
      stderr: "",
    });
    runner.calls[1]!.finish({ code: 0, stdout: '{"id":"{0.0.0}.{x}","name":"CABLE Input (VB-Audio)"}\r\n', stderr: "" });

    expect(await voices).toEqual([
      { id: "Microsoft David Desktop", name: "Microsoft David Desktop", lang: "en-US", isDefault: false },
    ]);
    expect(await devices).toEqual([{ id: "{0.0.0}.{x}", name: "CABLE Input (VB-Audio)" }]);
  });
});

describe("parseWindowsJsonList", () => {
  it("accepts arrays, single objects and garbage", () => {
    expect(parseWindowsJsonList('[{"id":"a","name":"A"},{"id":2}]')).toEqual([{ id: "a", name: "A" }]);
    expect(parseWindowsJsonList('{"id":"a","name":"A"}')).toEqual([{ id: "a", name: "A" }]);
    expect(parseWindowsJsonList("")).toEqual([]);
    expect(parseWindowsJsonList("not json")).toEqual([]);
  });
});
