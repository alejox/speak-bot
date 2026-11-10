import type { AudioDevice, Voice } from "@speak-bot/core";
import { MAX_RATE, MIN_RATE, type SpeechSettings } from "../adapters/local-storage-settings-store";
import type { SpeakTarget } from "../adapters/local-storage-speak-target-store";

interface SettingsPanelProps {
  voices: Voice[];
  settings: SpeechSettings;
  onChange: (settings: SpeechSettings) => void;
  /** Shown only when a desktop computer is available. */
  speakOn?: { value: SpeakTarget; onChange: (target: SpeakTarget) => void } | null;
  /** Shown only when speaking on a computer that can choose its output device. */
  outputDevice?: { devices: AudioDevice[]; selectedId: string; onChange: (deviceId: string) => void } | null;
}

export function SettingsPanel({ voices, settings, onChange, speakOn, outputDevice }: SettingsPanelProps) {
  return (
    <details className="settings">
      <summary>Voice settings</summary>

      {speakOn && (
        <label className="field">
          <span>Speak on</span>
          <select value={speakOn.value} onChange={(event) => speakOn.onChange(event.target.value as SpeakTarget)}>
            <option value="device">This device</option>
            <option value="computer">Computer</option>
          </select>
        </label>
      )}

      {outputDevice && (
        <label className="field">
          <span>Output device</span>
          <select value={outputDevice.selectedId} onChange={(event) => outputDevice.onChange(event.target.value)}>
            <option value="">System default</option>
            {outputDevice.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Voice</span>
        <select value={settings.voiceId} onChange={(event) => onChange({ ...settings, voiceId: event.target.value })}>
          <option value="">System default</option>
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>
          Speed <output>{settings.rate.toFixed(1)}×</output>
        </span>
        <input
          type="range"
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.1}
          value={settings.rate}
          onChange={(event) => onChange({ ...settings, rate: Number(event.target.value) })}
        />
      </label>
    </details>
  );
}
