import { useId, type FormEvent } from "react";
import { useT } from "../i18n/I18nProvider";

interface DockComposerProps {
  text: string;
  isSpeaking: boolean;
  onTextChange: (text: string) => void;
  onSpeak: () => void;
  onStop: () => void;
}

/** One-line text box with Speak and Stop, sized for a narrow OBS dock. */
export function DockComposer({ text, isSpeaking, onTextChange, onSpeak, onStop }: DockComposerProps) {
  const t = useT();
  const inputId = useId();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSpeak();
  };
  return (
    <form className="dock-composer" aria-label={t("composer.region")} onSubmit={submit}>
      <label htmlFor={inputId} className="visually-hidden">
        {t("composer.textLabel")}
      </label>
      <input
        id={inputId}
        className="dock-input"
        value={text}
        placeholder={t("composer.placeholder")}
        enterKeyHint="send"
        autoComplete="off"
        onChange={(event) => onTextChange(event.target.value)}
      />
      <div className="dock-actions">
        <button type="submit" className="button button-small button-primary">
          {t("composer.speak")}
        </button>
        <button type="button" className="button button-small" onClick={onStop} disabled={!isSpeaking}>
          {t("composer.stop")}
        </button>
      </div>
    </form>
  );
}
