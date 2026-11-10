import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@speak-bot/core";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { translate, type Message, type MessageKey, type MessageParams } from "./messages";

export type Translate = (key: MessageKey, params?: MessageParams) => string;

interface I18nValue {
  language: UiLanguage;
  t: Translate;
}

const I18nContext = createContext<I18nValue>({
  language: DEFAULT_UI_LANGUAGE,
  t: (key, params) => translate(DEFAULT_UI_LANGUAGE, key, params),
});

/** Provides the interface language and keeps `<html lang>` in sync with it. */
export function I18nProvider({ language, children }: { language: UiLanguage; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({ language, t: (key, params) => translate(language, key, params) }), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The translate function for the current language. */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

export function useLanguage(): UiLanguage {
  return useContext(I18nContext).language;
}

/** Translates a stored message, or returns "" for none. */
export function useMessageText(message: Message | null): string {
  const t = useT();
  return message ? t(message.key, message.params) : "";
}
