import { QUICK_PHRASES_BY_LANGUAGE, type UiLanguage } from "@speed-deck/core";
import { useT } from "../i18n/I18nProvider";

interface QuickPhrasesProps {
  /** The voice language: the phrases are said, so they follow the voice and not the interface. */
  language: UiLanguage;
  /** Says a phrase at once, the way a phrase key does. */
  onSpeak: (text: string) => void;
}

/**
 * Four short answers above the keys of every Voice board and page, always in the same place and order so
 * they can be found without looking. They are not keys: they take no slot and never move.
 */
export function QuickPhrases({ language, onSpeak }: QuickPhrasesProps) {
  const t = useT();
  return (
    <div className="quick-phrases" role="group" aria-label={t("quick.label")}>
      {QUICK_PHRASES_BY_LANGUAGE[language].map((phrase) => (
        <button key={phrase} type="button" className="button quick-phrase" onClick={() => onSpeak(phrase)}>
          <span className="quick-phrase-text">{phrase}</span>
        </button>
      ))}
    </div>
  );
}
