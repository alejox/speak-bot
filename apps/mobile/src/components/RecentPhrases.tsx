import { useT } from "../i18n/I18nProvider";

interface RecentPhrasesProps {
  /** Most recent first; nothing is rendered while it is empty. */
  phrases: readonly string[];
  /** Says a phrase again; called synchronously inside the tap. */
  onSpeak: (phrase: string) => void;
  onClear: () => void;
}

/** The texts last spoken from the composer, as one row of chips that scrolls sideways. */
export function RecentPhrases({ phrases, onSpeak, onClear }: RecentPhrasesProps) {
  const t = useT();
  if (phrases.length === 0) return null;
  return (
    <section className="recent" aria-label={t("recent.region")}>
      <ul className="recent-list">
        {phrases.map((phrase) => (
          <li key={phrase}>
            <button type="button" className="recent-chip" onClick={() => onSpeak(phrase)}>
              <span className="recent-chip-text">{phrase}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="button button-small recent-clear" onClick={onClear} aria-label={t("recent.clearLabel")}>
        {t("recent.clear")}
      </button>
    </section>
  );
}
