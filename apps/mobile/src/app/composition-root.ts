import type { PhraseDependencies } from "@speak-bot/core";
import { LocalStoragePhraseRepository } from "../adapters/local-storage-phrase-repository";
import { LocalStorageSettingsStore, type SettingsStore } from "../adapters/local-storage-settings-store";
import { WebSpeechSynthesizer, type AppSpeechSynthesizer } from "../adapters/web-speech-synthesizer";

export interface AppServices {
  synthesizer: AppSpeechSynthesizer;
  phrases: PhraseDependencies;
  settings: SettingsStore;
  /** True when default phrases should be seeded (first run on this device). */
  isFirstRun: () => boolean;
}

export function createAppServices(): AppServices {
  const repository = new LocalStoragePhraseRepository();
  return {
    synthesizer: new WebSpeechSynthesizer(),
    phrases: { repository, generateId: () => crypto.randomUUID(), now: () => Date.now() },
    settings: new LocalStorageSettingsStore(),
    isFirstRun: () => !repository.isInitialized(),
  };
}
