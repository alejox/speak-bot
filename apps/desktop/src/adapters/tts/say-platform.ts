import type { AudioDevice, Voice } from "@speed-deck/core";
import { readCommandOutput } from "./command-runner";
import { rateToWordsPerMinute, type DesktopSpeakOptions, type SpeechPlatform } from "./process-speech-synthesizer";

/** macOS: the built-in `say` command, which can target any output device with `-a`. */
export const macosSayPlatform: SpeechPlatform = {
  capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: true },
  installHint: "The `say` command ships with macOS; check that /usr/bin is on PATH.",

  buildSpeakCommand(text, options) {
    const args = voiceArgs(options);
    if (options.deviceId) args.push("-a", options.deviceId);
    // `--` stops option parsing, so text starting with "-" is still spoken as text.
    args.push("--", text);
    return [{ command: "say", args }];
  },

  buildRenderCommand(text, options, file) {
    // 16-bit PCM WAV: `say` writes AIFF by default, which Chromium (OBS's browser) cannot play.
    return [{ command: "say", args: [...voiceArgs(options), "-o", file, "--file-format=WAVE", "--data-format=LEI16@22050", "--", text] }];
  },

  buildPlayFileCommand(file, options) {
    // afplay always uses the default output; with a chosen device the text is spoken again instead.
    return options.deviceId ? null : [{ command: "afplay", args: [file] }];
  },

  async listVoices(runner) {
    return parseSayVoices(await readCommandOutput(runner, { command: "say", args: ["-v", "?"] }));
  },

  async listDevices(runner) {
    return parseSayDevices(await readCommandOutput(runner, { command: "say", args: ["-a", "?"] }));
  },
};

function voiceArgs(options: DesktopSpeakOptions): string[] {
  const args: string[] = [];
  if (options.voiceId) args.push("-v", options.voiceId);
  if (options.rate !== undefined) args.push("-r", String(rateToWordsPerMinute(options.rate)));
  return args;
}

// "Eddy (English (US)) en_US    # Hello! My name is Eddy."
const VOICE_LINE = /^(.+?)\s+([a-z]{2,3}[_-][A-Za-z0-9]+)\s+#/;

export function parseSayVoices(output: string): Voice[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = VOICE_LINE.exec(line.trim());
    if (!match) return [];
    const name = match[1]!.trim();
    return [{ id: name, name, lang: match[2]!.replace("_", "-"), isDefault: false }];
  });
}

// "   77 BlackHole 2ch" — the name is used as id because numeric ids can change between reboots.
const DEVICE_LINE = /^\s*\d+\s+(.+?)\s*$/;

export function parseSayDevices(output: string): AudioDevice[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = DEVICE_LINE.exec(line);
    return match ? [{ id: match[1]!, name: match[1]! }] : [];
  });
}
