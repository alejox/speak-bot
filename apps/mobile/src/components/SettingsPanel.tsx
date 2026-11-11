import { isUiLanguage, isVoiceOutput, UI_LANGUAGES, VOICE_OUTPUTS, type AudioDevice, type UiLanguage, type Voice, type VoiceOutput } from "@speed-deck/core";
import { Volume2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { TEXT_SIZES, THEME_PREFERENCES, type Appearance, type TextSize, type ThemePreference } from "../adapters/local-storage-appearance-store";
import { MAX_RATE, MIN_RATE, type SpeechSettings } from "../adapters/local-storage-settings-store";
import type { SpeakTarget } from "../adapters/local-storage-speak-target-store";
import { groupVoicesByLanguage, languageOf, voiceLabel, voicesForLanguage } from "../app/voice-options";
import { useLanguage, useT } from "../i18n/I18nProvider";
import { LANGUAGE_NAMES, translate, type MessageKey } from "../i18n/messages";

const THEME_LABELS: Record<ThemePreference, MessageKey> = { system: "settings.themeSystem", light: "settings.themeLight", dark: "settings.themeDark" };
const TEXT_SIZE_LABELS: Record<TextSize, MessageKey> = {
  normal: "settings.textSizeNormal",
  large: "settings.textSizeLarge",
  "extra-large": "settings.textSizeExtraLarge",
};

const VOICE_OUTPUT_LABELS: Record<VoiceOutput, MessageKey> = {
  speakers: "settings.voiceOutputSpeakers",
  obs: "settings.voiceOutputObs",
  both: "settings.voiceOutputBoth",
};

const PREVIEW_ICON_SIZE = 20;
const RATE_STEP = 0.1;
const formatRate = (rate: number) => `${rate.toFixed(1)}×`;

interface SettingsPanelProps {
  voices: Voice[];
  /** False until the voices were asked for once: an empty list is only "no voices" after that. */
  voicesLoaded: boolean;
  /** The language the app speaks; the picker starts with its voices. */
  voiceLanguage: UiLanguage;
  settings: SpeechSettings;
  onChange: (settings: SpeechSettings) => void;
  isSpeaking: boolean;
  /** Speaks a sample with the current voice and speed; called synchronously inside the tap. */
  onPreview: (sample: string) => void;
  onLanguageChange: (language: UiLanguage) => void;
  /** Theme and text size of this device. */
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  /** Shown only when a desktop computer is available. */
  speakOn?: { value: SpeakTarget; onChange: (target: SpeakTarget) => void } | null;
  /** Shown only when speaking on a computer that can choose its output device. */
  outputDevice?: { devices: AudioDevice[]; selectedId: string; onChange: (deviceId: string) => void } | null;
  /** Shown only when speaking on a computer that can send the voice to OBS as its own audio channel. */
  voiceOutput?: { value: VoiceOutput; overlayConnected: boolean | null; onChange: (output: VoiceOutput) => void } | null;
  /** Shown only when using a computer: vibrate when the link to it is lost and when it is back. */
  vibrateOnDisconnect?: { value: boolean; onChange: (vibrate: boolean) => void } | null;
  /** More groups after the built-in ones (Remove ads). */
  children?: ReactNode;
}

/** A titled group of settings. */
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <div className="settings-group" role="group" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {children}
    </div>
  );
}

export function SettingsPanel({
  voices,
  voicesLoaded,
  voiceLanguage,
  settings,
  onChange,
  isSpeaking,
  onPreview,
  onLanguageChange,
  appearance,
  onAppearanceChange,
  speakOn,
  outputDevice,
  voiceOutput,
  vibrateOnDisconnect,
  children,
}: SettingsPanelProps) {
  const t = useT();
  const language = useLanguage();
  const voiceSelectId = useId();
  const rateId = useId();
  const voiceOutputId = useId();
  const [showAllVoices, setShowAllVoices] = useState(false);

  const selectedVoice = voices.find((voice) => voice.id === settings.voiceId);
  const matching = voicesForLanguage(voices, voiceLanguage, language);
  // A voice chosen earlier stays in the list even when it speaks another language.
  const listed = selectedVoice && !matching.includes(selectedVoice) ? [...matching, selectedVoice] : matching;
  const hasNoVoices = voicesLoaded && voices.length === 0;

  // The sample is in the language of the voice that will say it, whatever the interface language.
  const sampleLanguage = selectedVoice ? languageOf(selectedVoice.lang) : voiceLanguage;
  const sample = translate(isUiLanguage(sampleLanguage) ? sampleLanguage : voiceLanguage, "settings.previewSample");

  return (
    <div className="settings">
      <SettingsGroup title={t("nav.voice")}>
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

        {voiceOutput && (
          <div className="field">
            <label htmlFor={voiceOutputId}>{t("settings.voiceOutput")}</label>
            <select
              id={voiceOutputId}
              value={voiceOutput.value}
              onChange={(event) => isVoiceOutput(event.target.value) && voiceOutput.onChange(event.target.value)}
            >
              {VOICE_OUTPUTS.map((output) => (
                <option key={output} value={output}>
                  {t(VOICE_OUTPUT_LABELS[output])}
                </option>
              ))}
            </select>
            <p className="field-hint">{t("settings.voiceOutputHint")}</p>
            {voiceOutput.value !== "speakers" && voiceOutput.overlayConnected === false && (
              <p className="field-hint field-warning" role="status">
                {t("settings.voiceOutputNoOverlay")}
              </p>
            )}
          </div>
        )}

        {hasNoVoices ? (
          <div className="field">
            <span>{t("settings.voice")}</span>
            <p className="field-hint">{t("settings.noVoices")}</p>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor={voiceSelectId}>{t("settings.voice")}</label>
              <div className="voice-picker">
                <select id={voiceSelectId} value={settings.voiceId} onChange={(event) => onChange({ ...settings, voiceId: event.target.value })}>
                  <option value="">{t("settings.voiceAuto")}</option>
                  {showAllVoices
                    ? groupVoicesByLanguage(voices, voiceLanguage, language).map((group) => (
                        <optgroup key={group.language} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : listed.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voiceLabel(voice, language)}
                        </option>
                      ))}
                </select>
                <button type="button" className="button button-small button-icon" onClick={() => onPreview(sample)} disabled={isSpeaking}>
                  <Volume2 size={PREVIEW_ICON_SIZE} aria-hidden="true" focusable="false" />
                  {t("settings.previewVoice")}
                </button>
              </div>
            </div>
            <label className="field-check">
              <input type="checkbox" checked={showAllVoices} onChange={(event) => setShowAllVoices(event.target.checked)} />
              <span>{t("settings.showAllVoices")}</span>
            </label>
          </>
        )}

        {/* An explicit label: wrapping would label the <output>, the first labelable element inside. */}
        <div className="field">
          <label htmlFor={rateId}>
            {t("settings.speed")} <output htmlFor={rateId}>{formatRate(settings.rate)}</output>
          </label>
          <input
            id={rateId}
            type="range"
            min={MIN_RATE}
            max={MAX_RATE}
            step={RATE_STEP}
            value={settings.rate}
            aria-valuetext={formatRate(settings.rate)}
            onChange={(event) => onChange({ ...settings, rate: Number(event.target.value) })}
          />
          {/* The ends of the scale, for the eye only: the slider already announces its value. */}
          <span className="range-hints" aria-hidden="true">
            <span>{formatRate(MIN_RATE)}</span>
            <span>{formatRate(MAX_RATE)}</span>
          </span>
        </div>
      </SettingsGroup>

      {vibrateOnDisconnect && (
        <SettingsGroup title={t("settings.connectionGroup")}>
          <label className="field-check">
            <input type="checkbox" checked={vibrateOnDisconnect.value} onChange={(event) => vibrateOnDisconnect.onChange(event.target.checked)} />
            <span>{t("settings.vibrateOnDisconnect")}</span>
          </label>
        </SettingsGroup>
      )}

      <SettingsGroup title={t("settings.appearance")}>
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
      </SettingsGroup>

      <SettingsGroup title={t("settings.languageGroup")}>
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
      </SettingsGroup>
      {children}
    </div>
  );
}
