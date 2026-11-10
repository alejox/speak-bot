import type { Phrase } from "@speak-bot/core";
import { useT } from "../i18n/I18nProvider";

interface PhraseGridProps {
  phrases: Phrase[];
  isEditing: boolean;
  onSpeak: (phrase: Phrase) => void;
  onDelete: (phrase: Phrase) => void;
  onToggleEditing: () => void;
}

export function PhraseGrid({ phrases, isEditing, onSpeak, onDelete, onToggleEditing }: PhraseGridProps) {
  const t = useT();
  return (
    <section className="phrases" aria-labelledby="phrases-heading">
      <div className="phrases-header">
        <h2 id="phrases-heading">{t("phrases.title")}</h2>
        <button type="button" className="button button-small" aria-pressed={isEditing} onClick={onToggleEditing}>
          {isEditing ? t("phrases.done") : t("phrases.edit")}
        </button>
      </div>

      {phrases.length === 0 ? (
        <p className="empty">{t("phrases.empty")}</p>
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
                    aria-label={t("phrases.deleteLabel", { text: title })}
                    onClick={() => onDelete(phrase)}
                  >
                    <span aria-hidden="true">✕ </span>
                    {title}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="phrase"
                    aria-label={t("phrases.speakLabel", { text: phrase.text })}
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
