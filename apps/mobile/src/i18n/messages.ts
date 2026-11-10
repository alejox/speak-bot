import { DEFAULT_PHRASE_TEXTS, type UiLanguage } from "@speak-bot/core";
import { en, type MessageKey, type Messages } from "./en";
import { es } from "./es";

export type { MessageKey, Messages };

export const DICTIONARIES: Record<UiLanguage, Messages> = { es, en };

/** Names shown in the language selector, each in its own language. */
export const LANGUAGE_NAMES: Record<UiLanguage, string> = { es: "Español", en: "English" };

/** Phrases saved on the first run on this device, in the interface language. */
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

export type MessageParams = Readonly<Record<string, string | number>>;

/** A message to show later, translated at render time so it follows language changes. */
export interface Message {
  key: MessageKey;
  params?: MessageParams;
}

/** Looks up `key` and replaces `{name}` placeholders with `params`. Unknown placeholders are kept. */
export function translate(language: UiLanguage, key: MessageKey, params?: MessageParams): string {
  const template = DICTIONARIES[language][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
