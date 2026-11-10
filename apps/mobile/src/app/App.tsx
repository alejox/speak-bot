import {
  deletePhrase,
  EmptyTextError,
  listPhrases,
  savePhrase,
  seedDefaultPhrases,
  speakText,
  stopSpeaking,
  type Phrase,
  type Voice,
} from "@speak-bot/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechSettings } from "../adapters/local-storage-settings-store";
import { SpeechUnsupportedError } from "../adapters/web-speech-synthesizer";
import { Composer } from "../components/Composer";
import { PhraseGrid } from "../components/PhraseGrid";
import { SettingsPanel } from "../components/SettingsPanel";
import type { AppServices } from "./composition-root";

/** Container: owns state and wires the UI to the core use cases. */
export function App({ services }: { services: AppServices }) {
  const { synthesizer, phrases: phraseDeps, settings: settingsStore } = services;
  const [text, setText] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [settings, setSettings] = useState<SpeechSettings>(() => settingsStore.load());
  const [isEditing, setIsEditing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("");
  const speechRequest = useRef(0);
  const phrasesLoaded = useRef(false);

  const refreshPhrases = useCallback(async () => {
    setPhrases(await listPhrases(phraseDeps.repository));
  }, [phraseDeps]);

  useEffect(() => {
    // Guard against StrictMode running this effect twice and seeding duplicates.
    if (phrasesLoaded.current) return;
    phrasesLoaded.current = true;
    void (async () => {
      if (services.isFirstRun()) await seedDefaultPhrases(phraseDeps);
      await refreshPhrases();
    })();
  }, [services, phraseDeps, refreshPhrases]);

  useEffect(() => {
    let active = true;
    const loadVoices = () => {
      void synthesizer.listVoices().then((loaded) => {
        if (active) setVoices(loaded);
      });
    };
    loadVoices();
    const unsubscribe = synthesizer.onVoicesChanged(loadVoices);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [synthesizer]);

  // Must not await before speakText: mobile browsers only allow speech inside the tap handler.
  const speak = (value: string) => {
    const request = ++speechRequest.current;
    setStatus("");
    setIsSpeaking(true);
    speakText(synthesizer, value, { voiceId: settings.voiceId || undefined, rate: settings.rate })
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
      setStatus("Type something to save it as a phrase.");
      return;
    }
    if (phrases.some((phrase) => phrase.text === trimmed)) {
      setStatus("That phrase is already saved.");
      return;
    }
    await savePhrase(phraseDeps, { text: trimmed });
    await refreshPhrases();
    setStatus("Phrase saved.");
  };

  const removePhrase = async (phrase: Phrase) => {
    await deletePhrase(phraseDeps.repository, phrase.id);
    await refreshPhrases();
    setStatus(`Deleted "${phrase.label ?? phrase.text}".`);
  };

  const updateSettings = (next: SpeechSettings) => {
    setSettings(next);
    settingsStore.save(next);
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>Speak Bot</h1>
      </header>

      {!synthesizer.isSupported && (
        <p className="notice" role="alert">
          Speech is not supported in this browser. Try Chrome or Safari.
        </p>
      )}

      <Composer
        text={text}
        isSpeaking={isSpeaking}
        onTextChange={setText}
        onSpeak={() => speak(text)}
        onStop={stop}
        onSave={() => void saveCurrentText()}
      />

      <p className="status" role="status" aria-live="polite">
        {status}
      </p>

      <PhraseGrid
        phrases={phrases}
        isEditing={isEditing}
        onSpeak={(phrase) => speak(phrase.text)}
        onDelete={(phrase) => void removePhrase(phrase)}
        onToggleEditing={() => setIsEditing((editing) => !editing)}
      />

      <SettingsPanel voices={voices} settings={settings} onChange={updateSettings} />
    </main>
  );
}

function describeSpeechError(error: unknown): string {
  if (error instanceof EmptyTextError) return "Type something to speak first.";
  if (error instanceof SpeechUnsupportedError) return error.message;
  return "Could not speak that. Please try again.";
}
