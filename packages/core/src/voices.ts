import type { Voice } from "./ports/speech-synthesizer";

/**
 * Primary language subtag of a voice language tag, lowercased.
 * Accepts Web Speech (`es-ES`), macOS `say` (`es_ES`) and espeak (`es`) styles.
 */
export function languageOfTag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * The voice to use when the user has not chosen one: a voice speaking `language`
 * (a primary subtag such as "es"), preferring the system default among them.
 */
export function pickVoiceForLanguage(voices: readonly Voice[], language: string): Voice | undefined {
  const wanted = languageOfTag(language);
  if (wanted === "") return undefined;
  const matching = voices.filter((voice) => languageOfTag(voice.lang) === wanted);
  return matching.find((voice) => voice.isDefault) ?? matching[0];
}
