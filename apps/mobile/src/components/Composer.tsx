import type { KeyboardEvent } from "react";

interface ComposerProps {
  text: string;
  isSpeaking: boolean;
  onTextChange: (text: string) => void;
  onSpeak: () => void;
  onStop: () => void;
  onSave: () => void;
}

export function Composer({ text, isSpeaking, onTextChange, onSpeak, onStop, onSave }: ComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter speaks, Shift+Enter inserts a new line. Ignore Enter while an IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSpeak();
    }
  };

  return (
    <section className="composer" aria-label="Type to speak">
      <label htmlFor="composer-text" className="visually-hidden">
        Text to speak
      </label>
      <textarea
        id="composer-text"
        className="composer-text"
        value={text}
        rows={3}
        placeholder="Type what you want to say…"
        enterKeyHint="send"
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="composer-actions">
        <button type="button" className="button button-primary" onClick={onSpeak}>
          Speak
        </button>
        <button type="button" className="button" onClick={onStop} disabled={!isSpeaking}>
          Stop
        </button>
        <button type="button" className="button" onClick={onSave}>
          Save as phrase
        </button>
      </div>
    </section>
  );
}
