import type { Phrase } from "@speed-deck/core";
import { useId } from "react";
import { useT } from "../i18n/I18nProvider";

/** How many deck keys (the first ones of page 1) the Speak section offers. */
export const QUICK_PHRASE_SLOTS = 5;

interface QuickPhrasesProps {
  title: string;
  phrases: Phrase[];
  onSpeak: (phrase: Phrase) => void;
}

/** The phrases in the first deck keys, as small keys; empty keys are left out. */
export function QuickPhrases({ title, phrases, onSpeak }: QuickPhrasesProps) {
  const t = useT();
  const headingId = useId();
  const quick = phrases.filter((phrase) => phrase.slot < QUICK_PHRASE_SLOTS).sort((a, b) => a.slot - b.slot);

  return (
    <section className="quick-phrases" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {quick.length === 0 ? (
        <p className="empty">{t("phrases.empty")}</p>
      ) : (
        <ul className="quick-grid">
          {quick.map((phrase) => (
            <li key={phrase.id}>
              <button
                type="button"
                className="deck-key deck-key-small"
                aria-label={t("phrases.speakLabel", { text: phrase.text })}
                onClick={() => onSpeak(phrase)}
              >
                <span className="deck-key-text">{phrase.label ?? phrase.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
