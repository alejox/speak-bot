import {
  isUiLanguage,
  voiceLanguageOf,
  type Action,
  type AudioDevice,
  type DesktopSettings,
  type DesktopSettingsPatch,
  type KeyRef,
  type MultiActionEvent,
  type ObsSettingsPatch,
  type ObsSettingsView,
  type SpeakErrorEvent,
  type SpeakingEvent,
  type SpeechCapabilities,
  type UiLanguage,
  type Voice,
  type Application,
} from "@speed-deck/core";
import { pendingBoardStore, type BoardStore } from "../adapters/board-stores";
import { useCallback, useEffect, useState } from "react";
import type { SpeechSettings } from "../adapters/local-storage-settings-store";
import type { SpeakTarget } from "../adapters/local-storage-speak-target-store";
import type { AppSpeechSynthesizer } from "../adapters/web-speech-synthesizer";
import type { MessageKey } from "../i18n/messages";
import type { AppServices, ExecuteActionResult, ObsServices } from "./composition-root";

/** How long each look for the desktop waits for its answer, attempt by attempt (the last one repeats). */
const DETECT_TIMEOUTS_MS = [1500, 3000, 5000];
/** The pause before each new look after one that found nothing. */
const DETECT_RETRY_DELAYS_MS = [300, 1000, 2000, 4000];
/** Looks before giving up until the page comes back online or into view. */
const DETECT_ATTEMPTS = 6;
/** Whether a desktop server answered: still asking, found, or not there. */
export type DesktopDetection = "pending" | "found" | "missing";

export interface SpeechTargetOptions {
  /** Always speak on the computer (the OBS dock); the "Speak on" choice is hidden. */
  forceComputer?: boolean;
}

export interface SpeechTarget {
  detection: DesktopDetection;
  /** True when speech, boards and settings come from the desktop. */
  isRemote: boolean;
  /** True when a desktop server answered, whichever target is chosen. */
  isDesktopAvailable: boolean;
  synthesizer: AppSpeechSynthesizer;
  /** The boards of the desktop in Computer mode, otherwise of this device. */
  boards: BoardStore;
  /** Runs voice, captions and OBS actions on the desktop; null when speaking on this device. */
  executeAction: ((action: Action, key?: KeyRef) => Promise<ExecuteActionResult>) | null;
  /** A multi-action started or ended on the desktop (from any device); never fires on this device. */
  onMultiActionEvent: (listener: (event: MultiActionEvent) => void) => () => void;
  /** Lists the applications of the computer for "open application" keys; null when speaking on this device. */
  listApplications: (() => Promise<Application[]>) | null;
  /** Tells the desktop whether someone is typing something to say; null when speaking on this device. */
  reportComposing: ((composing: boolean) => void) | null;
  /** OBS through the desktop; null when speaking on this device. */
  obs: ObsServices | null;
  /** The desktop started or stopped speaking (from any device); never fires on this device. */
  onSpeechEvent: (listener: (event: SpeakingEvent | SpeakErrorEvent) => void) => () => void;
  settings: SpeechSettings;
  updateSettings: (next: SpeechSettings) => void;
  voices: Voice[];
  /** False until the current synthesizer answered with its voices once. */
  voicesLoaded: boolean;
  /** Null when no desktop is available, so the "Speak on" choice is hidden. */
  speakOn: { value: SpeakTarget; onChange: (target: SpeakTarget) => void } | null;
  /** Null unless speaking on a desktop that can route audio to a chosen device. */
  outputDevice: { devices: AudioDevice[]; selectedId: string; onChange: (deviceId: string) => void } | null;
  /** Interface language saved on the desktop; null unless speaking on the desktop and loaded. */
  desktopLanguage: UiLanguage | null;
  /** Saves the interface language on the desktop (no-op unless speaking on the desktop). */
  saveDesktopLanguage: (language: UiLanguage) => void;
  /** Merges settings a desktop action reported (e.g. the new voice language) without saving them again. */
  noteDesktopSettings: (patch: Partial<DesktopSettings>) => void;
  /** OBS connection settings saved on the desktop; null unless speaking on the desktop and loaded. */
  obsSettings: ObsSettingsView | null;
  /** Saves OBS settings on the desktop (only allowed from the computer itself). */
  saveObsSettings: (patch: ObsSettingsPatch) => Promise<DesktopSettings>;
  /** True when this page is open on the computer that runs the desktop app. */
  isOnComputer: boolean;
  /** Whether OBS captions are shown; null unless speaking on the desktop and loaded. */
  captionsVisible: boolean | null;
  setCaptionsVisible: (visible: boolean) => void;
  /** Language of the automatic voice, or null to follow the interface language of this device. */
  voiceLanguage: UiLanguage | null;
  /** Chooses the automatic voice language and drops an explicitly chosen voice. */
  setVoiceLanguage: (language: UiLanguage) => void;
  /** Last error from talking to the desktop, if any. */
  error: MessageKey | null;
}

const noSubscription = () => () => {};
const noDesktop = () => Promise.reject(new Error("No desktop."));

/** Chooses between local speech and the desktop companion, and owns the matching settings. */
export function useSpeechTarget(services: AppServices, { forceComputer = false }: SpeechTargetOptions = {}): SpeechTarget {
  const { desktop } = services;
  const [capabilities, setCapabilities] = useState<SpeechCapabilities | null>(null);
  const [isDetected, setIsDetected] = useState(false);
  const [target, setTarget] = useState<SpeakTarget>(() => desktop?.target.load() ?? "computer");
  const [localSettings, setLocalSettings] = useState<SpeechSettings>(() => services.settings.load());
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  // Looks for the desktop, and keeps looking: a phone that just joined the Wi-Fi (or woke up) may miss the
  // first answer. Each attempt waits longer; coming back online or to the page starts over at once.
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let found = false;
    let searching = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const search = () => {
      if (!active || found || searching) return;
      searching = true;
      const timeoutMs = DETECT_TIMEOUTS_MS[Math.min(attempt, DETECT_TIMEOUTS_MS.length - 1)];
      void desktop.probe(timeoutMs).then((result) => {
        searching = false;
        if (!active) return;
        if (result.kind === "found") {
          found = true;
          setCapabilities(result.capabilities);
          setIsDetected(true);
          return;
        }
        attempt += 1;
        // Only a sure "not the desktop" or the last missed answer gives up; until then the phone keeps waiting.
        if (result.kind === "unreachable" && attempt < DETECT_ATTEMPTS) {
          retry = setTimeout(search, DETECT_RETRY_DELAYS_MS[Math.min(attempt - 1, DETECT_RETRY_DELAYS_MS.length - 1)]);
          return;
        }
        setIsDetected(true);
      });
    };
    const searchAgain = () => {
      if (found || document.visibilityState === "hidden") return;
      clearTimeout(retry);
      attempt = 0;
      search();
    };

    search();
    window.addEventListener("online", searchAgain);
    document.addEventListener("visibilitychange", searchAgain);
    return () => {
      active = false;
      clearTimeout(retry);
      window.removeEventListener("online", searchAgain);
      document.removeEventListener("visibilitychange", searchAgain);
    };
  }, [desktop]);

  const isRemote = desktop !== undefined && capabilities !== null && (forceComputer || target === "computer");
  const remote = isRemote ? desktop : undefined;
  const supportsDevices = isRemote && capabilities?.supportsDeviceSelection === true;
  const synthesizer = remote?.synthesizer ?? services.synthesizer;

  useEffect(() => {
    if (!remote) return;
    let active = true;
    remote.loadSettings().then(
      (loaded) => active && setDesktopSettings(loaded),
      () => active && setError("error.loadDesktopSettings"),
    );
    return () => {
      active = false;
    };
  }, [remote]);

  useEffect(() => {
    if (!remote) return;
    const stopVisibility = remote.onCaptionsVisibilityChanged((visible) =>
      setDesktopSettings((current) => (current ? { ...current, captionsVisible: visible } : current)),
    );
    // Language, voice and OBS settings chosen on another device or in the tray apply right away.
    const stopSettings = remote.onSettingsChanged(setDesktopSettings);
    return () => {
      stopVisibility();
      stopSettings();
    };
  }, [remote]);

  useEffect(() => {
    if (!remote || !supportsDevices) return;
    let active = true;
    remote.listDevices().then(
      (loaded) => active && setDevices(loaded),
      () => active && setDevices([]),
    );
    return () => {
      active = false;
    };
  }, [remote, supportsDevices]);

  useEffect(() => {
    let active = true;
    setVoicesLoaded(false);
    const loadVoices = () => {
      void synthesizer.listVoices().then((loaded) => {
        if (!active) return;
        setVoices(loaded);
        setVoicesLoaded(true);
      });
    };
    loadVoices();
    const unsubscribe = synthesizer.onVoicesChanged(loadVoices);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [synthesizer]);

  const saveDesktopSettings = useCallback(
    (patch: Omit<DesktopSettingsPatch, "obs">) => {
      if (!remote) return;
      setDesktopSettings((current) => (current ? { ...current, ...patch } : current));
      remote.saveSettings(patch).then(setDesktopSettings, () => setError("error.saveDesktopSettings"));
    },
    [remote],
  );

  const settings: SpeechSettings = isRemote
    ? { voiceId: desktopSettings?.voiceId ?? "", rate: desktopSettings?.rate ?? 1 }
    : localSettings;

  const saveLocalSettings = (next: SpeechSettings) => {
    setLocalSettings(next);
    services.settings.save(next);
  };

  const updateSettings = (next: SpeechSettings) => {
    if (isRemote) {
      const patch: Partial<DesktopSettings> = {};
      if (next.voiceId !== settings.voiceId) patch.voiceId = next.voiceId;
      if (next.rate !== settings.rate) patch.rate = next.rate;
      saveDesktopSettings(patch);
      return;
    }
    saveLocalSettings(next);
  };

  const detection: DesktopDetection = !desktop ? "missing" : !isDetected ? "pending" : capabilities ? "found" : "missing";

  return {
    detection,
    isRemote,
    isDesktopAvailable: desktop !== undefined && capabilities !== null,
    synthesizer,
    // While still looking, no boards: the phone's own would flash (and be created) before the desktop's.
    boards: remote?.boards ?? (detection === "pending" ? pendingBoardStore : services.boards),
    executeAction: remote ? remote.executeAction : null,
    reportComposing: remote ? remote.reportComposing : null,
    listApplications: remote ? remote.listApplications : null,
    obs: remote ? remote.obs : null,
    onSpeechEvent: remote ? remote.onSpeechEvent : noSubscription,
    onMultiActionEvent: remote ? remote.onMultiActionEvent : noSubscription,
    settings,
    updateSettings,
    voices,
    voicesLoaded,
    speakOn:
      desktop && capabilities && !forceComputer
        ? {
            value: target,
            onChange: (next) => {
              setTarget(next);
              desktop.target.save(next);
            },
          }
        : null,
    outputDevice: supportsDevices
      ? {
          devices,
          selectedId: desktopSettings?.deviceId ?? "",
          onChange: (deviceId) => saveDesktopSettings({ deviceId }),
        }
      : null,
    desktopLanguage: isRemote && isUiLanguage(desktopSettings?.language) ? desktopSettings.language : null,
    saveDesktopLanguage: (language) => saveDesktopSettings({ language }),
    noteDesktopSettings: (patch) => setDesktopSettings((current) => (current ? { ...current, ...patch } : current)),
    obsSettings: isRemote && desktopSettings?.obs ? desktopSettings.obs : null,
    saveObsSettings: remote
      ? async (obs) => {
          const updated = await remote.saveSettings({ obs });
          setDesktopSettings(updated);
          return updated;
        }
      : noDesktop,
    isOnComputer: desktop?.connection !== undefined,
    captionsVisible: isRemote && typeof desktopSettings?.captionsVisible === "boolean" ? desktopSettings.captionsVisible : null,
    setCaptionsVisible: (captionsVisible) => saveDesktopSettings({ captionsVisible }),
    voiceLanguage: isRemote
      ? desktopSettings
        ? voiceLanguageOf(desktopSettings)
        : null
      : (localSettings.voiceLanguage ?? null),
    setVoiceLanguage: (voiceLanguage) => {
      if (isRemote) saveDesktopSettings({ voiceLanguage, voiceId: "" });
      else saveLocalSettings({ ...localSettings, voiceLanguage, voiceId: "" });
    },
    error,
  };
}
