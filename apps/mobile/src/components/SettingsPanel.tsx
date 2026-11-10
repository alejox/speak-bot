import { UI_LANGUAGES, type AudioDevice, type UiLanguage, type Voice } from "@speed-deck/core";
import { useId, type ReactNode } from "react";
import { TEXT_SIZES, THEME_PREFERENCES, type Appearance, type TextSize, type ThemePreference } from "../adapters/local-storage-appearance-store";
import { MAX_RATE, MIN_RATE, type SpeechSettings } from "../adapters/local-storage-settings-store";
import type { SpeakTarget } from "../adapters/local-storage-speak-target-store";
import { useLanguage, useT } from "../i18n/I18nProvider";
import { LANGUAGE_NAMES, type MessageKey } from "../i18n/messages";

const THEME_LABELS: Record<ThemePreference, MessageKey> = { system: "settings.themeSystem", light: "settings.themeLight", dark: "settings.themeDark" };
const TEXT_SIZE_LABELS: Record<TextSize, MessageKey> = {
  normal: "settings.textSizeNormal",
  large: "settings.textSizeLarge",
  "extra-large": "settings.textSizeExtraLarge",
};

interface SettingsPanelProps {
  voices: Voice[];
  settings: SpeechSettings;
  onChange: (settings: SpeechSettings) => void;
  onLanguageChange: (language: UiLanguage) => void;
  /** Theme and text size of this device. */
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  /** Shown only when a desktop computer is available. */
  speakOn?: { value: SpeakTarget; onChange: (target: SpeakTarget) => void } | null;
  /** Shown only when speaking on a computer that can choose its output device. */
  outputDevice?: { devices: AudioDevice[]; selectedId: string; onChange: (deviceId: string) => void } | null;
  /** Extra groups after the speech settings (e.g. the OBS connection). */
  children?: ReactNode;
}

export function SettingsPanel({
  voices,
  settings,
  onChange,
  onLanguageChange,
  appearance,
  onAppearanceChange,
  speakOn,
  outputDevice,
  children,
}: SettingsPanelProps) {
  const t = useT();
  const appearanceTitleId = useId();
  const language = useLanguage();
  return (
    <div className="settings">
      <label className="field">
        <span>{t("settings.language")}</span>
        <select value={language} onChange={(event) => onLanguageChange(event.target.value as UiLanguage)}>
          {UI_LANGUAGES.map((code) => (
            <option key={code} value={code} lang={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>

      {speakOn && (
        <label className="field">
          <span>{t("settings.speakOn")}</span>
          <select value={speakOn.value} onChange={(event) => speakOn.onChange(event.target.value as SpeakTarget)}>
            <option value="device">{t("settings.speakOnDevice")}</option>
            <option value="computer">{t("settings.speakOnComputer")}</option>
          </select>
        </label>
      )}

      {outputDevice && (
        <label className="field">
          <span>{t("settings.outputDevice")}</span>
          <select value={outputDevice.selectedId} onChange={(event) => outputDevice.onChange(event.target.value)}>
            <option value="">{t("settings.systemDefault")}</option>
            {outputDevice.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>{t("settings.voice")}</span>
        <select value={settings.voiceId} onChange={(event) => onChange({ ...settings, voiceId: event.target.value })}>
          <option value="">{t("settings.voiceAuto")}</option>
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>
          {t("settings.speed")} <output>{settings.rate.toFixed(1)}×</output>
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

      <div className="settings-group" role="group" aria-labelledby={appearanceTitleId}>
        <h3 id={appearanceTitleId}>{t("settings.appearance")}</h3>
        <label className="field">
          <span>{t("settings.theme")}</span>
          <select value={appearance.theme} onChange={(event) => onAppearanceChange({ ...appearance, theme: event.target.value as ThemePreference })}>
            {THEME_PREFERENCES.map((theme) => (
              <option key={theme} value={theme}>
                {t(THEME_LABELS[theme])}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("settings.textSize")}</span>
          <select value={appearance.textSize} onChange={(event) => onAppearanceChange({ ...appearance, textSize: event.target.value as TextSize })}>
            {TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {t(TEXT_SIZE_LABELS[size])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {children}
    </div>
  );
}
