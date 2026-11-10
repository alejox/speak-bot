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
export {
  DESKTOP_SERVER_NAME,
  isServerEvent,
  MAX_SPEAK_TEXT_LENGTH,
  type AudioDevice,
  type CaptionEvent,
  type DesktopSettings,
  type DevicesResponse,
  type ErrorResponse,
  type HealthResponse,
  type PhrasesChangedEvent,
  type PhrasesResponse,
  type SavePhraseRequest,
  type ServerEvent,
  type SpeakErrorEvent,
  type SpeakingEvent,
  type SpeechCapabilities,
  type SpeakRequest,
  type VoicesResponse,
} from "./protocol";
