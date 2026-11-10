import type { Phrase } from "@speak-bot/core";

interface PhraseGridProps {
  phrases: Phrase[];
  isEditing: boolean;
  onSpeak: (phrase: Phrase) => void;
  onDelete: (phrase: Phrase) => void;
  onToggleEditing: () => void;
}

export function PhraseGrid({ phrases, isEditing, onSpeak, onDelete, onToggleEditing }: PhraseGridProps) {
  return (
    <section className="phrases" aria-labelledby="phrases-heading">
      <div className="phrases-header">
        <h2 id="phrases-heading">Saved phrases</h2>
        <button type="button" className="button button-small" aria-pressed={isEditing} onClick={onToggleEditing}>
          {isEditing ? "Done" : "Edit"}
        </button>
      </div>

      {phrases.length === 0 ? (
        <p className="empty">No saved phrases yet. Type something and press “Save as phrase”.</p>
      ) : (
        <ul className="phrase-grid">
          {phrases.map((phrase) => {
            const title = phrase.label ?? phrase.text;
            return (
              <li key={phrase.id}>
                {isEditing ? (
                  <button
                    type="button"
                    className="phrase phrase-delete"
                    aria-label={`Delete phrase: ${title}`}
                    onClick={() => onDelete(phrase)}
                  >
                    <span aria-hidden="true">✕ </span>
                    {title}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="phrase"
                    aria-label={`Speak: ${phrase.text}`}
                    onClick={() => onSpeak(phrase)}
                  >
                    {title}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
