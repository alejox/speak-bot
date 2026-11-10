import { isUiLanguage, type UiLanguage } from "@speed-deck/core";
import { getLocalStorage, readJson, writeJson } from "./browser-storage";

export interface LanguageStore {
  /** Null when the user never chose a language on this device. */
  load(): UiLanguage | null;
  save(language: UiLanguage): void;
}

export const LANGUAGE_STORAGE_KEY = "speed-deck:language";

export class LocalStorageLanguageStore implements LanguageStore {
  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = LANGUAGE_STORAGE_KEY,
  ) {}

  load(): UiLanguage | null {
    const stored = readJson(this.storage, this.key);
    return isUiLanguage(stored) ? stored : null;
  }

  save(language: UiLanguage): void {
    writeJson(this.storage, this.key, language);
  }
}
