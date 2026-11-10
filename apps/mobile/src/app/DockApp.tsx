import { useState } from "react";
import { ActionDeck } from "../components/ActionDeck";
import { DockComposer } from "../components/DockComposer";
import { PhraseDeck } from "../components/PhraseDeck";
import { I18nProvider, useLanguage, useMessageText, useT } from "../i18n/I18nProvider";
import type { Message } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { useDeckActions } from "./use-deck-actions";
import { useLanguagePreference } from "./use-language-preference";
import { usePhraseBook } from "./use-phrase-book";
import { useSpeech } from "./use-speech";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

/**
 * Container for the OBS Custom Browser Dock: a compact view that always speaks on the computer,
 * sharing its phrases and settings. Only useful when the desktop app serves the page.
 */
export function DockApp({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services, { forceComputer: true });
  const { language } = useLanguagePreference(services.language, target);
  return (
    <I18nProvider language={language}>
      <div className="dock">
        {target.detection === "found" && target.isRemote ? <DockContent target={target} /> : <DockUnavailable target={target} />}
      </div>
    </I18nProvider>
  );
}

function DockUnavailable({ target }: { target: SpeechTarget }) {
  const t = useT();
  return (
    <p className="dock-message" role="status">
      {target.detection === "pending" ? t("dock.checking") : t("dock.noDesktop")}
    </p>
  );
}

function DockContent({ target }: { target: SpeechTarget }) {
  const t = useT();
  const language = useLanguage();
  const [status, setStatus] = useState<Message | null>(null);
  const statusText = useMessageText(status);
  const speech = useSpeech(target, language, setStatus);
  const book = usePhraseBook(target, language, setStatus);
  const actions = useDeckActions(target, speech, setStatus);
  const [text, setText] = useState("");

  return (
    <main className="dock-main">
      <h1 className="visually-hidden">{t("app.title")}</h1>
      <DockComposer
        text={text}
        isSpeaking={speech.isSpeaking}
        onTextChange={setText}
        onSpeak={() => speech.speak(text)}
        onStop={speech.stop}
      />
      <p className="status" role="status" aria-live="polite">
        {statusText || (target.error ? t(target.error) : "")}
      </p>
      <PhraseDeck
        title={t("nav.phrases")}
        variant="dock"
        phrases={book.phrases}
        onSpeak={(phrase) => speech.speak(phrase.text)}
        onTest={speech.speak}
        onAdd={book.addAt}
        onEdit={book.edit}
        onDelete={book.remove}
      />
      <ActionDeck title={t("actions.title")} actions={actions} />
    </main>
  );
}
