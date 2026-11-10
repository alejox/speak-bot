import type { Phrase } from "@speak-bot/core";
import { useId } from "react";
import { useT } from "../i18n/I18nProvider";
import { AddPhraseForm } from "./AddPhraseForm";
import { RestoreDefaults } from "./RestoreDefaults";

export interface PhraseEditing {
  isEditing: boolean;
  onToggle: () => void;
  onDelete: (phrase: Phrase) => void;
  onAdd: (text: string) => Promise<boolean>;
  onRestore: () => Promise<void>;
}

interface PhraseBoardProps {
  title: string;
  phrases: Phrase[];
  onSpeak: (phrase: Phrase) => void;
  /** "large" for the Phrases section, "compact" for quick phrases and the OBS dock. */
  size?: "large" | "compact";
  /** Omit for a read-only board. */
  editing?: PhraseEditing;
}

/** Soundboard of phrase buttons flowing left to right in rows of equal-size buttons. */
export function PhraseBoard({ title, phrases, onSpeak, size = "large", editing }: PhraseBoardProps) {
  const t = useT();
  const headingId = useId();
  const isEditing = editing?.isEditing === true;

  return (
    <section className={`phrase-board phrase-board-${size}`} aria-labelledby={headingId}>
      <div className="phrase-board-header">
        <h3 id={headingId}>{title}</h3>
        {editing && (
          <button type="button" className="button button-small" aria-pressed={isEditing} onClick={editing.onToggle}>
            {isEditing ? t("phrases.done") : t("phrases.edit")}
          </button>
        )}
      </div>

      {editing && isEditing && <AddPhraseForm onAdd={editing.onAdd} />}

      {phrases.length === 0 ? (
        // Only an editable board offers a way to add phrases; read-only boards (quick phrases, OBS dock) stay neutral.
        <p className="empty">{t(editing ? "phrases.emptyEditable" : "phrases.empty")}</p>
      ) : (
        <ul className="phrase-grid">
          {phrases.map((phrase) => {
            const label = phrase.label ?? phrase.text;
            return (
              <li key={phrase.id}>
                {editing && isEditing ? (
                  <button
                    type="button"
                    className="phrase phrase-delete"
                    aria-label={t("phrases.deleteLabel", { text: label })}
                    onClick={() => editing.onDelete(phrase)}
                  >
                    <span aria-hidden="true">✕ </span>
                    {label}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="phrase"
                    aria-label={t("phrases.speakLabel", { text: phrase.text })}
                    onClick={() => onSpeak(phrase)}
                  >
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && isEditing && (
        <div className="phrase-board-danger">
          <RestoreDefaults onRestore={editing.onRestore} />
        </div>
      )}
    </section>
  );
}
