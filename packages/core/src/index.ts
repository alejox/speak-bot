export { createPhrase, InvalidPhraseError, type Phrase, type PhraseInput } from "./domain/phrase";
export type { PhraseRepository } from "./ports/phrase-repository";
export type { SpeakOptions, SpeechSynthesizer, Voice } from "./ports/speech-synthesizer";
export { EmptyTextError, speakText, stopSpeaking } from "./use-cases/speak";
export {
  DEFAULT_PHRASE_TEXTS,
  deletePhrase,
  listPhrases,
  savePhrase,
  seedDefaultPhrases,
  type PhraseDependencies,
} from "./use-cases/phrases";
