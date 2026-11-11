import type { AudioDevice, Voice } from "@speed-deck/core";
import { readCommandOutput } from "./command-runner";
import { rateToWordsPerMinute, type SpeechPlatform } from "./process-speech-synthesizer";

/**
 * Linux: `espeak-ng --stdout` renders WAV that Node pipes into `paplay --device=<sink>`.
 * PulseAudio and PipeWire (through its pulse compatibility layer) both work.
 */
export const linuxEspeakPlatform: SpeechPlatform = {
  capabilities: { platform: "linux", engine: "espeak-ng", supportsDeviceSelection: true },
  installHint: "Install espeak-ng and pulseaudio-utils (e.g. `sudo apt install espeak-ng pulseaudio-utils`).",

  buildSpeakCommand(text, options) {
    const speakArgs = ["--stdin", "--stdout"];
    if (options.voiceId) speakArgs.push("-v", options.voiceId);
    speakArgs.push("-s", String(rateToWordsPerMinute(options.rate)));
    return [
      // Text goes through stdin, so it is never parsed as an option.
      { command: "espeak-ng", args: speakArgs, input: text },
      { command: "paplay", args: options.deviceId ? [`--device=${options.deviceId}`] : [] },
    ];
  },

  buildRenderCommand(text, options, file) {
    const args = ["--stdin", "-w", file];
    if (options.voiceId) args.push("-v", options.voiceId);
    args.push("-s", String(rateToWordsPerMinute(options.rate)));
    return [{ command: "espeak-ng", args, input: text }];
  },

  buildPlayFileCommand(file, options) {
    return [{ command: "paplay", args: options.deviceId ? [`--device=${options.deviceId}`, file] : [file] }];
  },

  async listVoices(runner) {
    return parseEspeakVoices(await readCommandOutput(runner, { command: "espeak-ng", args: ["--voices"] }));
  },

  async listDevices(runner) {
    return parsePactlSinks(await readCommandOutput(runner, { command: "pactl", args: ["list", "short", "sinks"] }));
  },
};

// " 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)"
export function parseEspeakVoices(output: string): Voice[] {
  const seen = new Set<string>();
  return output.split(/\r?\n/).flatMap((line) => {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 4 || !/^\d+$/.test(columns[0]!)) return [];
    const lang = columns[1]!;
    if (seen.has(lang)) return [];
    seen.add(lang);
    return [{ id: lang, name: columns[3]!.replace(/_/g, " "), lang, isDefault: false }];
  });
}

// "47\talsa_output.pci-0000_00_1f.3.analog-stereo\tPipeWire\ts32le 2ch 48000Hz\tRUNNING"
export function parsePactlSinks(output: string): AudioDevice[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const name = line.split("\t")[1]?.trim();
    return name ? [{ id: name, name }] : [];
  });
}
