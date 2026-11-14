import type {
  AdsPurchase,
  KeyRef,
  MultiActionEvent,
  Action,
  AdCreative,
  AdsPurchaseReport,
  AdsResponse,
  AppUpdateState,
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
  Application,
} from "@speed-deck/core";
import { findAndroidAdsPurchase } from "../adapters/android-ads-purchase";
import { AndroidSpeechSynthesizer, findAndroidSpeechBridge } from "../adapters/android-speech-synthesizer";
import { createLocalBoardStore, createRemoteBoardStore, type BoardStore } from "../adapters/board-stores";
import { getLocalStorage, migrateLegacyStorageKeys } from "../adapters/browser-storage";
import { copyText as copyToClipboard } from "../adapters/clipboard";
import { DesktopApiClient, type ConnectionInfo, type DesktopProbe } from "../adapters/desktop-api";
import { DesktopEventSource, type WebSocketFactory } from "../adapters/desktop-events";
import { findDeviceIdentity, type DeviceIdentity } from "../adapters/device-identity";
import { createDeviceSignals, type DeviceSignals } from "../adapters/device-signals";
import { LocalStorageAppearanceStore, type AppearanceStore } from "../adapters/local-storage-appearance-store";
import { LocalStorageConnectionAlertsStore, type ConnectionAlertsStore } from "../adapters/local-storage-connection-alerts-store";
import { LocalStorageBoardRepository } from "../adapters/local-storage-board-repository";
import { LocalStorageLanguageStore, type LanguageStore } from "../adapters/local-storage-language-store";
import { LocalStorageRecentPhrasesStore, type RecentPhrasesStore } from "../adapters/local-storage-recent-phrases-store";
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
  /** A multi-action that was still running for the same key: nothing new started. */
  ignored?: true;
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
  /** An input's volume as OBS's multiplier (1 = 0 dB); rejects when OBS has no such input with audio. */
  getInputVolume(inputName: string): Promise<number>;
  setInputVolume(inputName: string, volumeMul: number): Promise<void>;
  /** An input's volume changed in OBS, from anywhere. Returns an unsubscribe function. */
  onInputVolume(listener: (inputName: string, volumeMul: number) => void): () => void;
}

/** Whether ads are removed on the computer; that covers every phone connected to it. */
export interface AdsServices {
  load(): Promise<AdsResponse>;
  /** Tells the computer whether this phone owns "remove ads"; resolves with the computer's new status. */
  report(report: AdsPurchaseReport): Promise<AdsResponse>;
  /** Ads were removed on the computer or came back. Returns an unsubscribe function. */
  onChanged(listener: (ads: AdsResponse) => void): () => void;
}

/** The computer app's version and updates. */
export interface AppUpdateServices {
  /** Null when the computer runs the server without the app or does not report its version. */
  load(): Promise<AppUpdateState | null>;
  /** Looks for a new version now; only the computer itself may ask. */
  check(): Promise<AppUpdateState | null>;
  /** Restarts the computer app to install a downloaded update; only the computer itself may ask. */
  install(): Promise<void>;
  /** The update state changed (a check, a download, the setting). Returns an unsubscribe function. */
  onChanged(listener: (update: AppUpdateState) => void): () => void;
}

/** Speaking and running keys through the desktop computer that serves this app. */
export interface DesktopServices {
  /** Asks whether a Speed Deck desktop serves this page: found, for sure not (absent), or no answer yet within `timeoutMs`. */
  probe(timeoutMs?: number): Promise<DesktopProbe>;
  synthesizer: AppSpeechSynthesizer;
  boards: BoardStore;
  /** Runs a voice, captions or OBS action on the desktop. */
  executeAction(action: Action, key?: KeyRef): Promise<ExecuteActionResult>;
  /** A multi-action started or ended on the desktop (from any device). */
  onMultiActionEvent(listener: (event: MultiActionEvent) => void): () => void;
  /** The applications of the computer that an "open application" key can open. */
  listApplications(): Promise<Application[]>;
  /** Tells the desktop whether someone is typing something to say (never what); failures are ignored. */
  reportComposing(composing: boolean): void;
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
  /** Whether an OBS overlay can play the voice right now. */
  loadOverlayConnected(): Promise<boolean>;
  /** Notifies when the first OBS overlay connects or the last one leaves. */
  onOverlayConnectedChanged(listener: (connected: boolean) => void): () => void;
  target: SpeakTargetStore;
  ads: AdsServices;
  appUpdate: AppUpdateServices;
  /** The sponsor banner the computer cached, or null for the house banner. */
  loadAd(): Promise<AdCreative | null>;
  /** Present only when this page is open on the desktop computer itself (localhost). */
  connection?: ConnectionServices;
  /** Reports each time the link to the desktop opens (true) or closes (false), and keeps it open while watched. */
  watchConnection(listener: (connected: boolean) => void): () => void;
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
  /** The texts last spoken from the composer on this device. */
  recentPhrases: RecentPhrasesStore;
  /** Present when the app may be served by the desktop companion. */
  desktop?: DesktopServices;
  /** The host name this page was served from (location.hostname); decides where the Deck can be edited. */
  servedFrom?: string;
  /** Vibration and what the device knows about the computer; without it nothing vibrates. */
  device?: DeviceSignals;
  /** Whether this device vibrates when it loses the computer; without it, this browser's storage. */
  connectionAlerts?: ConnectionAlertsStore;
  /** "Remove ads" as the app store sells it; present only inside the Android app (Google Play). */
  adsPurchase?: AdsPurchase;
  /** What identifies this phone to a computer when it reports its purchase; null when it cannot be identified. */
  deviceIdentity?: () => DeviceIdentity | null;
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
    probe: (timeoutMs) => api.probe(timeoutMs),
    synthesizer: new RemoteSpeechSynthesizer(api, events),
    boards: createRemoteBoardStore(api, events),
    executeAction: (action, key) => api.executeAction(action, key),
    onMultiActionEvent: (listener) =>
      events.subscribe((event) => {
        if (event.type === "multi-action") listener(event);
      }),
    listApplications: () => api.listApplications(),
    reportComposing: (composing) => void api.setComposing(composing).catch(() => {}),
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
      getInputVolume: (inputName) => api.getObsInputVolume(inputName),
      setInputVolume: (inputName, volumeMul) => api.setObsInputVolume(inputName, volumeMul),
      onInputVolume: (listener) =>
        events.subscribe((event) => {
          if (event.type === "obs-input-volume") listener(event.inputName, event.volumeMul);
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
    loadOverlayConnected: async () => (await api.loadVoiceStatus()).overlayConnected === true,
    onOverlayConnectedChanged: (listener) =>
      events.subscribe((event) => {
        if (event.type === "overlay-audio") listener(event.connected);
      }),
    target: options.targetStore ?? new LocalStorageSpeakTargetStore(),
    ads: {
      load: () => api.loadAds(),
      report: (report) => api.reportAdsPurchase(report),
      onChanged: (listener) =>
        events.subscribe((event) => {
          if (event.type === "ads-changed") listener(event.ads);
        }),
    },
    appUpdate: {
      load: () => api.loadAppUpdate(),
      check: () => api.checkAppUpdate(),
      install: () => api.installAppUpdate(),
      onChanged: (listener) =>
        events.subscribe((event) => {
          if (event.type === "app-update") listener(event.update);
        }),
    },
    loadAd: () => api.loadAd(),
    watchConnection: (listener) => events.watchConnection(listener),
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
    synthesizer: createLocalSynthesizer(),
    boards: createLocalBoardStore(new LocalStorageBoardRepository(), createId),
    settings: new LocalStorageSettingsStore(),
    language: new LocalStorageLanguageStore(),
    appearance: new LocalStorageAppearanceStore(),
    recentPhrases: new LocalStorageRecentPhrasesStore(),
    desktop: createDesktopServices(),
    servedFrom: globalThis.location?.hostname ?? "",
    device: createDeviceSignals(globalThis),
    connectionAlerts: new LocalStorageConnectionAlertsStore(),
    adsPurchase: findAndroidAdsPurchase(globalThis),
    deviceIdentity: () => findDeviceIdentity(globalThis),
  };
}

/** Speech on this device: Android's TextToSpeech inside the Android app (its WebView has no speechSynthesis), else the Web Speech API. */
function createLocalSynthesizer(): AppSpeechSynthesizer {
  const android = findAndroidSpeechBridge(globalThis);
  return android ? new AndroidSpeechSynthesizer(android.bridge, android.subscribe) : new WebSpeechSynthesizer();
}
