import type {
  Action,
  AudioDevice,
  DesktopSettings,
  DesktopSettingsPatch,
  ObsInput,
  ObsSceneItem,
  ObsStateEvent,
  ObsStatus,
  ObsStatusEvent,
  ObsStatusResponse,
  SpeakErrorEvent,
  SpeakingEvent,
  SpeechCapabilities,
  UiLanguage,
} from "@speed-deck/core";
import { createLocalBoardStore, createRemoteBoardStore, type BoardStore } from "../adapters/board-stores";
import { getLocalStorage, migrateLegacyStorageKeys } from "../adapters/browser-storage";
import { copyText as copyToClipboard } from "../adapters/clipboard";
import { DesktopApiClient, type ConnectionInfo } from "../adapters/desktop-api";
import { DesktopEventSource, type WebSocketFactory } from "../adapters/desktop-events";
import { LocalStorageAppearanceStore, type AppearanceStore } from "../adapters/local-storage-appearance-store";
import { LocalStorageBoardRepository } from "../adapters/local-storage-board-repository";
import { LocalStorageLanguageStore, type LanguageStore } from "../adapters/local-storage-language-store";
import { LocalStorageSettingsStore, type SettingsStore } from "../adapters/local-storage-settings-store";
import { LocalStorageSpeakTargetStore, type SpeakTargetStore } from "../adapters/local-storage-speak-target-store";
import { createQrCodeImage } from "../adapters/qr-code";
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

/** What `POST /api/actions/execute` answers; settings an action changed come back with it. */
export interface ExecuteActionResult {
  ok: true;
  captionsVisible?: boolean;
  voiceLanguage?: UiLanguage;
}

/** OBS as the desktop sees it: status, lists for the key editor, and live changes. */
export interface ObsServices {
  loadStatus(): Promise<ObsStatusResponse>;
  listScenes(): Promise<string[]>;
  listInputs(): Promise<ObsInput[]>;
  listSceneItems(sceneName: string): Promise<ObsSceneItem[]>;
  /** Connects again with the saved settings (only from the computer itself). */
  connect(): Promise<ObsStatus>;
  onEvent(listener: (event: ObsStatusEvent | ObsStateEvent) => void): () => void;
}

/** Speaking and running keys through the desktop computer that serves this app. */
export interface DesktopServices {
  /** Resolves with the desktop capabilities, or null when no desktop serves this page. */
  detect(): Promise<SpeechCapabilities | null>;
  synthesizer: AppSpeechSynthesizer;
  boards: BoardStore;
  /** Runs a voice, captions or OBS action on the desktop. */
  executeAction(action: Action): Promise<ExecuteActionResult>;
  obs: ObsServices;
  listDevices(): Promise<AudioDevice[]>;
  loadSettings(): Promise<DesktopSettings>;
  saveSettings(patch: DesktopSettingsPatch): Promise<DesktopSettings>;
  /** The desktop settings changed (from any device, the tray or a key). */
  onSettingsChanged(listener: (settings: DesktopSettings) => void): () => void;
  /** The desktop started or stopped speaking, or could not speak (from any device). */
  onSpeechEvent(listener: (event: SpeakingEvent | SpeakErrorEvent) => void): () => void;
  /** Notifies when OBS captions are turned on or off from any device. */
  onCaptionsVisibilityChanged(listener: (visible: boolean) => void): () => void;
  target: SpeakTargetStore;
  /** Present only when this page is open on the desktop computer itself (localhost). */
  connection?: ConnectionServices;
}

export interface AppServices {
  /** Local (this device) speech, boards and settings. */
  synthesizer: AppSpeechSynthesizer;
  boards: BoardStore;
  settings: SettingsStore;
  /** The interface language chosen on this device. */
  language: LanguageStore;
  /** The theme and text size chosen on this device. */
  appearance: AppearanceStore;
  /** Present when the app may be served by the desktop companion. */
  desktop?: DesktopServices;
}

export interface DesktopServicesOptions {
  fetch?: typeof fetch;
  createSocket?: WebSocketFactory;
  location?: Pick<Location, "protocol" | "host"> & Partial<Pick<Location, "hostname">>;
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
    boards: createRemoteBoardStore(api, events),
    executeAction: (action) => api.executeAction(action),
    obs: {
      loadStatus: () => api.loadObsStatus(),
      listScenes: () => api.listObsScenes(),
      listInputs: () => api.listObsInputs(),
      listSceneItems: (sceneName) => api.listObsSceneItems(sceneName),
      connect: () => api.connectObs(),
      onEvent: (listener) =>
        events.subscribe((event) => {
          if (event.type === "obs-status" || event.type === "obs-state") listener(event);
        }),
    },
    listDevices: () => api.listDevices(),
    loadSettings: () => api.loadSettings(),
    saveSettings: (patch) => api.saveSettings(patch),
    onSettingsChanged: (listener) =>
      events.subscribe((event) => {
        if (event.type === "settings-changed") listener(event.settings);
      }),
    onSpeechEvent: (listener) =>
      events.subscribe((event) => {
        if (event.type === "speaking" || event.type === "speak-error") listener(event);
      }),
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
  migrateLegacyStorageKeys(getLocalStorage());
  return {
    synthesizer: new WebSpeechSynthesizer(),
    boards: createLocalBoardStore(new LocalStorageBoardRepository(), createId),
    settings: new LocalStorageSettingsStore(),
    language: new LocalStorageLanguageStore(),
    appearance: new LocalStorageAppearanceStore(),
    desktop: createDesktopServices(),
  };
}
