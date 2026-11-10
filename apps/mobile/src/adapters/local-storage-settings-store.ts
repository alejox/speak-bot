import { getLocalStorage, readJson, writeJson } from "./browser-storage";

export interface SpeechSettings {
  /** Empty string means the system default voice. */
  voiceId: string;
  rate: number;
}

export const DEFAULT_SETTINGS: SpeechSettings = { voiceId: "", rate: 1 };
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;
export const SETTINGS_STORAGE_KEY = "speak-bot:settings";

export interface SettingsStore {
  load(): SpeechSettings;
  save(settings: SpeechSettings): void;
}

export class LocalStorageSettingsStore implements SettingsStore {
  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = SETTINGS_STORAGE_KEY,
  ) {}

  load(): SpeechSettings {
    const stored = readJson(this.storage, this.key);
    if (typeof stored !== "object" || stored === null) return { ...DEFAULT_SETTINGS };
    const { voiceId, rate } = stored as Record<string, unknown>;
    return {
      voiceId: typeof voiceId === "string" ? voiceId : DEFAULT_SETTINGS.voiceId,
      rate:
        typeof rate === "number" && rate >= MIN_RATE && rate <= MAX_RATE ? rate : DEFAULT_SETTINGS.rate,
    };
  }

  save(settings: SpeechSettings): void {
    writeJson(this.storage, this.key, settings);
  }
}
