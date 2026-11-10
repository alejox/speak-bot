import type { AudioDevice, DesktopSettings, PhraseDependencies, SpeechCapabilities, Voice } from "@speak-bot/core";
import { useCallback, useEffect, useState } from "react";
import type { SpeechSettings } from "../adapters/local-storage-settings-store";
import type { SpeakTarget } from "../adapters/local-storage-speak-target-store";
import type { AppSpeechSynthesizer } from "../adapters/web-speech-synthesizer";
import type { AppServices } from "./composition-root";

export interface SpeechTarget {
  /** True when speech, phrases and settings come from the desktop. */
  isRemote: boolean;
  synthesizer: AppSpeechSynthesizer;
  phrases: PhraseDependencies;
  /** Only meaningful for this device: seeding happens on the desktop itself. */
  isFirstRun: () => boolean;
  settings: SpeechSettings;
  updateSettings: (next: SpeechSettings) => void;
  voices: Voice[];
  /** Null when no desktop is available, so the "Speak on" choice is hidden. */
  speakOn: { value: SpeakTarget; onChange: (target: SpeakTarget) => void } | null;
  /** Null unless speaking on a desktop that can route audio to a chosen device. */
  outputDevice: { devices: AudioDevice[]; selectedId: string; onChange: (deviceId: string) => void } | null;
  onPhrasesChanged: (listener: () => void) => () => void;
  /** Last error from talking to the desktop, if any. */
  error: string;
}

const noSubscription = () => () => {};
const neverFirstRun = () => false;

/** Chooses between local speech and the desktop companion, and owns the matching settings. */
export function useSpeechTarget(services: AppServices): SpeechTarget {
  const { desktop } = services;
  const [capabilities, setCapabilities] = useState<SpeechCapabilities | null>(null);
  const [target, setTarget] = useState<SpeakTarget>(() => desktop?.target.load() ?? "computer");
  const [localSettings, setLocalSettings] = useState<SpeechSettings>(() => services.settings.load());
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop.detect().then((detected) => {
      if (active) setCapabilities(detected);
    });
    return () => {
      active = false;
    };
  }, [desktop]);

  const isRemote = desktop !== undefined && capabilities !== null && target === "computer";
  const remote = isRemote ? desktop : undefined;
  const supportsDevices = isRemote && capabilities?.supportsDeviceSelection === true;
  const synthesizer = remote?.synthesizer ?? services.synthesizer;

  useEffect(() => {
    if (!remote) return;
    let active = true;
    remote.loadSettings().then(
      (loaded) => active && setDesktopSettings(loaded),
      () => active && setError("Could not load the computer settings."),
    );
    return () => {
      active = false;
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
    const loadVoices = () => {
      void synthesizer.listVoices().then((loaded) => {
        if (active) setVoices(loaded);
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
    (patch: Partial<DesktopSettings>) => {
      if (!remote) return;
      setDesktopSettings((current) => (current ? { ...current, ...patch } : current));
      remote.saveSettings(patch).then(setDesktopSettings, () => setError("Could not save the computer settings."));
    },
    [remote],
  );

  const settings: SpeechSettings = isRemote
    ? { voiceId: desktopSettings?.voiceId ?? "", rate: desktopSettings?.rate ?? 1 }
    : localSettings;

  const updateSettings = (next: SpeechSettings) => {
    if (isRemote) {
      const patch: Partial<DesktopSettings> = {};
      if (next.voiceId !== settings.voiceId) patch.voiceId = next.voiceId;
      if (next.rate !== settings.rate) patch.rate = next.rate;
      saveDesktopSettings(patch);
      return;
    }
    setLocalSettings(next);
    services.settings.save(next);
  };

  return {
    isRemote,
    synthesizer,
    phrases: remote?.phrases ?? services.phrases,
    isFirstRun: isRemote ? neverFirstRun : services.isFirstRun,
    settings,
    updateSettings,
    voices,
    speakOn:
      desktop && capabilities
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
    onPhrasesChanged: remote ? remote.onPhrasesChanged : noSubscription,
    error,
  };
}
