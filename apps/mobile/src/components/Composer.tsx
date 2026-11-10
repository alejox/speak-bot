import type { KeyboardEvent } from "react";
import { useT } from "../i18n/I18nProvider";

interface ComposerProps {
  text: string;
  isSpeaking: boolean;
  onTextChange: (text: string) => void;
  onSpeak: () => void;
  onStop: () => void;
  onSave: () => void;
}

export function Composer({ text, isSpeaking, onTextChange, onSpeak, onStop, onSave }: ComposerProps) {
  const t = useT();
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter speaks, Shift+Enter inserts a new line. Ignore Enter while an IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSpeak();
    }
  };

  return (
    <section className="composer" aria-label={t("composer.region")}>
      <label htmlFor="composer-text" className="visually-hidden">
        {t("composer.textLabel")}
      </label>
      <textarea
        id="composer-text"
        className="composer-text"
        value={text}
        rows={3}
        placeholder={t("composer.placeholder")}
        enterKeyHint="send"
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="composer-actions">
        <button type="button" className="button button-primary" onClick={onSpeak}>
          {t("composer.speak")}
        </button>
        <button type="button" className="button" onClick={onStop} disabled={!isSpeaking}>
          {t("composer.stop")}
        </button>
        <button type="button" className="button" onClick={onSave}>
          {t("composer.save")}
        </button>
      </div>
    </section>
  );
}
