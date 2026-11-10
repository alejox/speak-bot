import type { AudioDevice, DesktopSettings, PhraseDependencies, SpeechCapabilities, UiLanguage } from "@speak-bot/core";
import { copyText as copyToClipboard } from "../adapters/clipboard";
import { DesktopApiClient, type ConnectionInfo } from "../adapters/desktop-api";
import { DesktopEventSource, type WebSocketFactory } from "../adapters/desktop-events";
import { LocalStorageLanguageStore, type LanguageStore } from "../adapters/local-storage-language-store";
import { LocalStoragePhraseRepository } from "../adapters/local-storage-phrase-repository";
import { LocalStorageSettingsStore, type SettingsStore } from "../adapters/local-storage-settings-store";
import { LocalStorageSpeakTargetStore, type SpeakTargetStore } from "../adapters/local-storage-speak-target-store";
import { createQrCodeImage } from "../adapters/qr-code";
import { RemotePhraseRepository } from "../adapters/remote-phrase-repository";
import { RemoteSpeechSynthesizer } from "../adapters/remote-speech-synthesizer";
import { WebSpeechSynthesizer, type AppSpeechSynthesizer } from "../adapters/web-speech-synthesizer";
import { createId } from "./create-id";

/** Pairing a phone with the desktop; only offered on the computer itself. */
export interface ConnectionServices {
  load(): Promise<ConnectionInfo>;
  /** Resolves with an image URL (data URL) of a QR code for `text`. */
  createQrCode(text: string): Promise<string>;
  /** Resolves true when the text reached the clipboard. */
  copyText(text: string): Promise<boolean>;
}

/** Speaking through the desktop computer that serves this app. */
export interface DesktopServices {
  /** Resolves with the desktop capabilities, or null when no desktop serves this page. */
  detect(): Promise<SpeechCapabilities | null>;
  synthesizer: AppSpeechSynthesizer;
  phrases: PhraseDependencies;
  /** Puts back the desktop communication board (the phrases) in `language`. */
  restorePhrases(language: UiLanguage): Promise<void>;
  listDevices(): Promise<AudioDevice[]>;
  loadSettings(): Promise<DesktopSettings>;
  saveSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  /** Notifies when phrases change on the desktop (e.g. edited from another device). */
  onPhrasesChanged(listener: () => void): () => void;
  /** Says the last spoken text again on the desktop. */
  repeat(): Promise<void>;
  /** Hides the current OBS caption. */
  clearCaption(): Promise<void>;
  /** Notifies when OBS captions are turned on or off from any device. */
  onCaptionsVisibilityChanged(listener: (visible: boolean) => void): () => void;
  target: SpeakTargetStore;
  /** Present only when this page is open on the desktop computer itself (localhost). */
  connection?: ConnectionServices;
}

export interface AppServices {
  /** Local (this device) speech, phrases and settings. */
  synthesizer: AppSpeechSynthesizer;
  phrases: PhraseDependencies;
  settings: SettingsStore;
  /** The interface language chosen on this device. */
  language: LanguageStore;
  /** True when default phrases should be seeded (first run on this device). */
  isFirstRun: () => boolean;
  /** Present when the app may be served by the desktop companion. */
  desktop?: DesktopServices;
}

export interface DesktopServicesOptions {
  fetch?: typeof fetch;
  createSocket?: WebSocketFactory;
  location?: Pick<Location, "protocol" | "host"> & Partial<Pick<Location, "hostname">>;
  generateId?: () => string;
  targetStore?: SpeakTargetStore;
  createQrCode?: (text: string) => Promise<string>;
  copyText?: (text: string) => Promise<boolean>;
}

/** True when the page is open on the computer running the desktop app, not on a phone. */
export function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export function createDesktopServices(options: DesktopServicesOptions = {}): DesktopServices {
  const location = options.location ?? window.location;
  const api = new DesktopApiClient(options.fetch);
  const events = new DesktopEventSource(options.createSocket, location);
  return {
    detect: () => api.detect(),
    synthesizer: new RemoteSpeechSynthesizer(api, events),
    phrases: {
      repository: new RemotePhraseRepository(api),
      generateId: options.generateId ?? createId,
      now: () => Date.now(),
    },
    restorePhrases: async (language) => {
      await api.restoreDefaultBoard(language);
    },
    listDevices: () => api.listDevices(),
    loadSettings: () => api.loadSettings(),
    saveSettings: (patch) => api.saveSettings(patch),
    onPhrasesChanged: (listener) =>
      events.subscribe((event) => {
        if (event.type === "boards-changed") listener();
      }),
    repeat: () => api.repeat(),
    clearCaption: () => api.clearCaption(),
    onCaptionsVisibilityChanged: (listener) =>
      events.subscribe((event) => {
        if (event.type === "captions-visibility") listener(event.visible);
      }),
    target: options.targetStore ?? new LocalStorageSpeakTargetStore(),
    connection: isLocalHostname(location.hostname ?? "")
      ? {
          load: () => api.loadConnection(),
          createQrCode: options.createQrCode ?? createQrCodeImage,
          copyText: options.copyText ?? ((text) => copyToClipboard(text)),
        }
      : undefined,
  };
}

export function createAppServices(): AppServices {
  const repository = new LocalStoragePhraseRepository();
  return {
    synthesizer: new WebSpeechSynthesizer(),
    phrases: { repository, generateId: createId, now: () => Date.now() },
    settings: new LocalStorageSettingsStore(),
    language: new LocalStorageLanguageStore(),
    isFirstRun: () => !repository.isInitialized(),
    desktop: createDesktopServices(),
  };
}
