import { DEFAULT_PHRASE_TEXTS, type UiLanguage } from "@speak-bot/core";

/** Phrases saved on the first run, in the interface language from the settings. */
export const DEFAULT_PHRASES: Record<UiLanguage, readonly string[]> = {
  es: [
    "Hola",
    "Gracias",
    "Sí",
    "No",
    "Por favor",
    "Un momento, por favor",
    "No puedo hablar, pero sí puedo escucharte",
    "¿Me puedes ayudar?",
  ],
  en: DEFAULT_PHRASE_TEXTS,
};
