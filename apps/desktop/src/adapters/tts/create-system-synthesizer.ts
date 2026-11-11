import { NodeCommandRunner, type CommandRunner } from "./command-runner";
import { linuxEspeakPlatform } from "./linux-platform";
import { ProcessSpeechSynthesizer, type DesktopSpeechSynthesizer, type SpeechPlatform } from "./process-speech-synthesizer";
import { macosSayPlatform } from "./say-platform";
import type { VoiceClipSink } from "./voice-clip-sink";
import { windowsSpeechPlatform } from "./windows-platform";

export function speechPlatformFor(platform: NodeJS.Platform): SpeechPlatform {
  switch (platform) {
    case "darwin":
      return macosSayPlatform;
    case "win32":
      return windowsSpeechPlatform;
    default:
      return linuxEspeakPlatform;
  }
}

export function createSystemSynthesizer(
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = new NodeCommandRunner(),
  clips?: VoiceClipSink,
): DesktopSpeechSynthesizer {
  return new ProcessSpeechSynthesizer(speechPlatformFor(platform), runner, clips);
}
