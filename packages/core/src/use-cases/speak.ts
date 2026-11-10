import type { SpeakOptions, SpeechSynthesizer } from "../ports/speech-synthesizer";

export class EmptyTextError extends Error {
  constructor() {
    super("There is no text to speak.");
    this.name = "EmptyTextError";
  }
}

export async function speakText(
  synthesizer: SpeechSynthesizer,
  text: string,
  options?: SpeakOptions,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === "") throw new EmptyTextError();
  await synthesizer.speak(trimmed, options);
}

export function stopSpeaking(synthesizer: SpeechSynthesizer): void {
  synthesizer.cancel();
}
