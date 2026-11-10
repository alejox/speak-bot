import { useState } from "react";
import { ActionDeck } from "../components/ActionDeck";
import { Composer } from "../components/Composer";
import { ConnectPanel } from "../components/ConnectPanel";
import { PhraseDeck } from "../components/PhraseDeck";
import { QuickPhrases } from "../components/QuickPhrases";
import { SectionView } from "../components/SectionView";
import { SettingsPanel } from "../components/SettingsPanel";
import { SideNav, type NavItem } from "../components/SideNav";
import { I18nProvider, useMessageText, useT } from "../i18n/I18nProvider";
import type { Message } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { useConnection } from "./use-connection";
import { useDeckActions } from "./use-deck-actions";
import { useLanguagePreference, type LanguagePreference } from "./use-language-preference";
import { usePhraseBook } from "./use-phrase-book";
import { useSection, type Section } from "./use-section";
import { useSpeech } from "./use-speech";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

export { describeSpeechError } from "./use-speech";

const SECTION_ICONS: Record<Section, string> = { speak: "💬", phrases: "▦", connect: "📱", settings: "⚙" };

/** Container: chooses the speech target and interface language, then renders the app in that language. */
export function App({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services);
  const preference = useLanguagePreference(services.language, target);
  return (
    <I18nProvider language={preference.language}>
      <AppContent services={services} target={target} preference={preference} />
    </I18nProvider>
  );
}

interface AppContentProps {
  services: AppServices;
  target: SpeechTarget;
  preference: LanguagePreference;
}

/** Container: wires the sections to the speech, phrase and connection hooks. */
function AppContent({ services, target, preference }: AppContentProps) {
  const t = useT();
  const { language } = preference;
  const connection = useConnection(services.desktop?.connection, target.isDesktopAvailable);
  const [status, setStatus] = useState<Message | null>(null);
  const statusText = useMessageText(status);
  const speech = useSpeech(target, language, setStatus);
  const book = usePhraseBook(target, language, setStatus);
  const actions = useDeckActions(target, speech, setStatus);
  const [storedSection, setSection] = useSection();
  const [navigated, setNavigated] = useState(false);
  const [text, setText] = useState("");

  // Connect only exists on the computer itself; fall back when it is not available.
  const section: Section = storedSection === "connect" && !connection ? "speak" : storedSection;
  const navItems: NavItem<Section>[] = (["speak", "phrases", "connect", "settings"] as const)
    .filter((id) => id !== "connect" || connection)
    .map((id) => ({ id, label: t(`nav.${id}`), icon: SECTION_ICONS[id] }));

  const select = (next: Section) => {
    setSection(next);
    setNavigated(true);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t("app.title")}</h1>
      </header>

      <SideNav items={navItems} active={section} onSelect={select} />

      <main className="app-main">
        {!target.synthesizer.isSupported && (
          <p className="notice" role="alert">
            {t("app.speechUnsupported")}
          </p>
        )}

        <p className="status" role="status" aria-live="polite">
          {statusText || (target.error ? t(target.error) : "")}
        </p>

        {section === "speak" && (
          <SectionView key="speak" title={t("nav.speak")} focusHeading={navigated}>
            <Composer
              text={text}
              isSpeaking={speech.isSpeaking}
              onTextChange={setText}
              onSpeak={() => speech.speak(text)}
              onStop={speech.stop}
              onSave={() => void book.add(text)}
            />
            <QuickPhrases title={t("speak.quickPhrases")} phrases={book.phrases} onSpeak={(phrase) => speech.speak(phrase.text)} />
          </SectionView>
        )}

        {section === "phrases" && (
          <SectionView key="phrases" title={t("nav.phrases")} focusHeading={navigated}>
            <PhraseDeck
              title={t("phrases.title")}
              phrases={book.phrases}
              onSpeak={(phrase) => speech.speak(phrase.text)}
              onTest={speech.speak}
              onAdd={book.addAt}
              onEdit={book.edit}
              onDelete={book.remove}
              onRestore={book.restoreDefaults}
            />
            <ActionDeck title={t("actions.title")} actions={actions} />
          </SectionView>
        )}

        {section === "connect" && connection && (
          <SectionView key="connect" title={t("nav.connect")} focusHeading={navigated}>
            <ConnectPanel {...connection} />
          </SectionView>
        )}

        {section === "settings" && (
          <SectionView key="settings" title={t("nav.settings")} focusHeading={navigated}>
            <SettingsPanel
              voices={target.voices}
              settings={target.settings}
              onChange={target.updateSettings}
              onLanguageChange={preference.setLanguage}
              speakOn={target.speakOn}
              outputDevice={target.outputDevice}
            />
          </SectionView>
        )}
      </main>
    </div>
  );
}
