import type { Voice } from "@speak-bot/core";
import { MAX_RATE, MIN_RATE, type SpeechSettings } from "../adapters/local-storage-settings-store";

interface SettingsPanelProps {
  voices: Voice[];
  settings: SpeechSettings;
  onChange: (settings: SpeechSettings) => void;
}

export function SettingsPanel({ voices, settings, onChange }: SettingsPanelProps) {
  return (
    <details className="settings">
      <summary>Voice settings</summary>

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
