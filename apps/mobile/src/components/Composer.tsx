import { BookmarkPlus, Square, Volume2, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useT } from "../i18n/I18nProvider";

const ICON_SIZE = 20;

interface ComposerProps {
  text: string;
  isSpeaking: boolean;
  onTextChange: (text: string) => void;
  onSpeak: () => void;
  onStop: () => void;
  onSave: () => void;
}

export interface ComposerHandle {
  focusText: () => void;
}

/**
 * Type to speak: a text box two lines tall that grows with what is typed (the stylesheet caps it and
 * scrolls from there) with a button to empty it while it holds text, the Speak action, and Stop and Save
 * on one row.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer({ text, isSpeaking, onTextChange, onSpeak, onStop, onSave }, ref) {
  const t = useT();
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focusText: () => textarea.current?.focus() }), []);

  // Grow with the content: the height follows the text, between the CSS minimum and maximum.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    const borders = element.offsetHeight - element.clientHeight;
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight + borders}px`;
  }, [text]);

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
      <div className="composer-field">
        <textarea
          ref={textarea}
          id="composer-text"
          className={text === "" ? "composer-text" : "composer-text composer-text-clearable"}
          value={text}
          rows={2}
          placeholder={t("composer.placeholder")}
          enterKeyHint="send"
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {text !== "" && (
          // Only the text goes: nothing is said, and the recent phrases and the captions stay.
          <button
            type="button"
            className="icon-button composer-clear"
            aria-label={t("composer.clear")}
            title={t("composer.clear")}
            onClick={() => {
              onTextChange("");
              textarea.current?.focus();
            }}
          >
            <X size={ICON_SIZE} aria-hidden="true" focusable="false" />
          </button>
        )}
      </div>
      <button type="button" className="button button-primary composer-speak" onClick={onSpeak}>
        <Volume2 size={ICON_SIZE + 4} aria-hidden="true" focusable="false" />
        {t("composer.speak")}
      </button>
      <div className="composer-actions">
        <button type="button" className="button button-icon" onClick={onStop} disabled={!isSpeaking}>
          <Square size={ICON_SIZE} aria-hidden="true" focusable="false" />
          {t("composer.stop")}
        </button>
        {/* The short label is what is drawn; the full one stays the button's name. */}
        <button type="button" className="button button-icon" onClick={onSave} aria-label={t("composer.save")}>
          <BookmarkPlus size={ICON_SIZE} aria-hidden="true" focusable="false" />
          {t("composer.saveShort")}
        </button>
      </div>
    </section>
  );
});
