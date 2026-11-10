import type { AudioDevice, DesktopSettings, PhraseDependencies, SpeechCapabilities } from "@speak-bot/core";
import { DesktopApiClient } from "../adapters/desktop-api";
import { DesktopEventSource, type WebSocketFactory } from "../adapters/desktop-events";
import { LocalStoragePhraseRepository } from "../adapters/local-storage-phrase-repository";
import { LocalStorageSettingsStore, type SettingsStore } from "../adapters/local-storage-settings-store";
import { LocalStorageSpeakTargetStore, type SpeakTargetStore } from "../adapters/local-storage-speak-target-store";
import { RemotePhraseRepository } from "../adapters/remote-phrase-repository";
import { RemoteSpeechSynthesizer } from "../adapters/remote-speech-synthesizer";
import { WebSpeechSynthesizer, type AppSpeechSynthesizer } from "../adapters/web-speech-synthesizer";
import { createId } from "./create-id";

/** Speaking through the desktop computer that serves this app. */
export interface DesktopServices {
  /** Resolves with the desktop capabilities, or null when no desktop serves this page. */
  detect(): Promise<SpeechCapabilities | null>;
  synthesizer: AppSpeechSynthesizer;
  phrases: PhraseDependencies;
  listDevices(): Promise<AudioDevice[]>;
  loadSettings(): Promise<DesktopSettings>;
  saveSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  /** Notifies when phrases change on the desktop (e.g. edited from another device). */
  onPhrasesChanged(listener: () => void): () => void;
  target: SpeakTargetStore;
}

export interface AppServices {
  /** Local (this device) speech, phrases and settings. */
  synthesizer: AppSpeechSynthesizer;
  phrases: PhraseDependencies;
  settings: SettingsStore;
  /** True when default phrases should be seeded (first run on this device). */
  isFirstRun: () => boolean;
  /** Present when the app may be served by the desktop companion. */
  desktop?: DesktopServices;
}

export interface DesktopServicesOptions {
  fetch?: typeof fetch;
  createSocket?: WebSocketFactory;
  location?: Pick<Location, "protocol" | "host">;
  generateId?: () => string;
  targetStore?: SpeakTargetStore;
}

export function createDesktopServices(options: DesktopServicesOptions = {}): DesktopServices {
  const api = new DesktopApiClient(options.fetch);
  const events = new DesktopEventSource(options.createSocket, options.location);
  return {
    detect: () => api.detect(),
    synthesizer: new RemoteSpeechSynthesizer(api, events),
    phrases: {
      repository: new RemotePhraseRepository(api),
      generateId: options.generateId ?? createId,
      now: () => Date.now(),
    },
    listDevices: () => api.listDevices(),
    loadSettings: () => api.loadSettings(),
    saveSettings: (patch) => api.saveSettings(patch),
    onPhrasesChanged: (listener) =>
      events.subscribe((event) => {
        if (event.type === "phrases-changed") listener();
      }),
    target: options.targetStore ?? new LocalStorageSpeakTargetStore(),
  };
}

export function createAppServices(): AppServices {
  const repository = new LocalStoragePhraseRepository();
  return {
    synthesizer: new WebSpeechSynthesizer(),
    phrases: { repository, generateId: createId, now: () => Date.now() },
    settings: new LocalStorageSettingsStore(),
    isFirstRun: () => !repository.isInitialized(),
    desktop: createDesktopServices(),
  };
}
