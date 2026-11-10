import {
  deletePhrase,
  EmptyTextError,
  listPhrases,
  pickVoiceForLanguage,
  savePhrase,
  seedDefaultPhrases,
  speakText,
  stopSpeaking,
  type Phrase,
} from "@speak-bot/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopRequestError } from "../adapters/desktop-api";
import { DesktopSpeechError } from "../adapters/remote-speech-synthesizer";
import { SpeechUnsupportedError } from "../adapters/web-speech-synthesizer";
import { Composer } from "../components/Composer";
import { ConnectPanel } from "../components/ConnectPanel";
import { PhraseGrid } from "../components/PhraseGrid";
import { SettingsPanel } from "../components/SettingsPanel";
import { I18nProvider, useMessageText, useT } from "../i18n/I18nProvider";
import { DEFAULT_PHRASES, type Message } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { useConnection } from "./use-connection";
import { useLanguagePreference, type LanguagePreference } from "./use-language-preference";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

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

/** Container: owns state and wires the UI to the core use cases. */
function AppContent({ services, target, preference }: AppContentProps) {
  const t = useT();
  const { language } = preference;
  const connection = useConnection(services.desktop?.connection, target.isDesktopAvailable);
  const { synthesizer, phrases: phraseDeps, settings, isFirstRun, onPhrasesChanged } = target;
  const [text, setText] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<Message | null>(null);
  const statusText = useMessageText(status);
  const speechRequest = useRef(0);
  // Shared across StrictMode's double effect run so defaults are seeded once, before the first list.
  const seeding = useRef<Promise<unknown> | null>(null);
  // Read when seeding, without reloading phrases on every language change.
  const languageRef = useRef(language);
  languageRef.current = language;

  const refreshPhrases = useCallback(async () => {
    setPhrases(await listPhrases(phraseDeps.repository));
  }, [phraseDeps]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const loaded = await listPhrases(phraseDeps.repository);
      if (active) setPhrases(loaded);
    };
    void (async () => {
      if (!target.isRemote) {
        seeding.current ??= isFirstRun()
          ? seedDefaultPhrases(phraseDeps, DEFAULT_PHRASES[languageRef.current])
          : Promise.resolve();
        await seeding.current;
      }
      await refresh();
    })().catch(() => {
      if (active) setStatus({ key: "status.loadFailed" });
    });
    const unsubscribe = onPhrasesChanged(() => void refresh().catch(() => {}));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [phraseDeps, target.isRemote, isFirstRun, onPhrasesChanged]);

  // The desktop picks its own voice for the language; on this device it is picked here.
  const voiceId = settings.voiceId || (target.isRemote ? undefined : pickVoiceForLanguage(target.voices, language)?.id);

  // Must not await before speakText: mobile browsers only allow speech inside the tap handler.
  const speak = (value: string) => {
    const request = ++speechRequest.current;
    setStatus(null);
    setIsSpeaking(true);
    speakText(synthesizer, value, { voiceId: voiceId || undefined, rate: settings.rate })
      .catch((error: unknown) => setStatus(describeSpeechError(error)))
      .finally(() => {
        if (request === speechRequest.current) setIsSpeaking(false);
      });
  };

  const stop = () => {
    speechRequest.current += 1;
    stopSpeaking(synthesizer);
    setIsSpeaking(false);
  };

  const saveCurrentText = async () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      setStatus({ key: "status.typeToSave" });
      return;
    }
    if (phrases.some((phrase) => phrase.text === trimmed)) {
      setStatus({ key: "status.duplicate" });
      return;
    }
    await savePhrase(phraseDeps, { text: trimmed });
    await refreshPhrases();
    setStatus({ key: "status.saved" });
  };

  const removePhrase = async (phrase: Phrase) => {
    await deletePhrase(phraseDeps.repository, phrase.id);
    await refreshPhrases();
    setStatus({ key: "status.deleted", params: { text: phrase.label ?? phrase.text } });
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>{t("app.title")}</h1>
      </header>

      {connection && <ConnectPanel {...connection} />}

      {!synthesizer.isSupported && (
        <p className="notice" role="alert">
          {t("app.speechUnsupported")}
        </p>
      )}

      <Composer
        text={text}
        isSpeaking={isSpeaking}
        onTextChange={setText}
        onSpeak={() => speak(text)}
        onStop={stop}
        onSave={() => void saveCurrentText().catch(() => setStatus({ key: "status.saveFailed" }))}
      />

      <p className="status" role="status" aria-live="polite">
        {statusText || (target.error ? t(target.error) : "")}
      </p>

      <PhraseGrid
        phrases={phrases}
        isEditing={isEditing}
        onSpeak={(phrase) => speak(phrase.text)}
        onDelete={(phrase) => void removePhrase(phrase).catch(() => setStatus({ key: "status.deleteFailed" }))}
        onToggleEditing={() => setIsEditing((editing) => !editing)}
      />

      <SettingsPanel
        voices={target.voices}
        settings={settings}
        onChange={target.updateSettings}
        onLanguageChange={preference.setLanguage}
        speakOn={target.speakOn}
        outputDevice={target.outputDevice}
      />
    </main>
  );
}

/** Maps a speech failure to a message in the interface language. */
export function describeSpeechError(error: unknown): Message {
  if (error instanceof EmptyTextError) return { key: "error.emptyText" };
  if (error instanceof SpeechUnsupportedError) return { key: "error.speechUnsupported" };
  if (error instanceof DesktopSpeechError) {
    return error.code === "engine-unavailable"
      ? { key: "error.engineUnavailable", params: { detail: error.message } }
      : { key: "error.desktopSpeechFailed" };
  }
  if (error instanceof DesktopRequestError) return { key: "error.desktopRequestFailed" };
  return { key: "error.speechFailed" };
}
