import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@speed-deck/core";
import { useState } from "react";
import type { LanguageStore } from "../adapters/local-storage-language-store";
import type { SpeechTarget } from "./use-speech-target";

export interface LanguagePreference {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
}

/**
 * The interface language: this device's explicit choice wins; otherwise, in Computer mode,
 * the language saved on the desktop; otherwise Spanish. Choosing a language in Computer mode
 * also saves it on the desktop, so the tray menu and first-run phrases follow it.
 */
export function useLanguagePreference(
  store: LanguageStore,
  target: Pick<SpeechTarget, "isRemote" | "desktopLanguage" | "saveDesktopLanguage">,
): LanguagePreference {
  const [choice, setChoice] = useState<UiLanguage | null>(() => store.load());
  return {
    language: choice ?? target.desktopLanguage ?? DEFAULT_UI_LANGUAGE,
    setLanguage: (next) => {
      setChoice(next);
      store.save(next);
      if (target.isRemote) target.saveDesktopLanguage(next);
    },
  };
}
