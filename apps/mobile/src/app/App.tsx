import {
  deletePhrase,
  EmptyTextError,
  listPhrases,
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
import { PhraseGrid } from "../components/PhraseGrid";
import { SettingsPanel } from "../components/SettingsPanel";
import type { AppServices } from "./composition-root";
import { useSpeechTarget } from "./use-speech-target";

/** Container: owns state and wires the UI to the core use cases. */
export function App({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services);
  const { synthesizer, phrases: phraseDeps, settings, isFirstRun, onPhrasesChanged } = target;
  const [text, setText] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("");
  const speechRequest = useRef(0);
  // Shared across StrictMode's double effect run so defaults are seeded once, before the first list.
  const seeding = useRef<Promise<unknown> | null>(null);

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
        seeding.current ??= isFirstRun() ? seedDefaultPhrases(phraseDeps) : Promise.resolve();
        await seeding.current;
      }
      await refresh();
    })().catch(() => {
      if (active) setStatus("Could not load phrases.");
    });
    const unsubscribe = onPhrasesChanged(() => void refresh().catch(() => {}));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [phraseDeps, target.isRemote, isFirstRun, onPhrasesChanged]);

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
        onSave={() => void saveCurrentText().catch(() => setStatus("Could not save the phrase."))}
      />

      <p className="status" role="status" aria-live="polite">
        {status || target.error}
      </p>

      <PhraseGrid
        phrases={phrases}
        isEditing={isEditing}
        onSpeak={(phrase) => speak(phrase.text)}
        onDelete={(phrase) => void removePhrase(phrase).catch(() => setStatus("Could not delete the phrase."))}
        onToggleEditing={() => setIsEditing((editing) => !editing)}
      />

      <SettingsPanel
        voices={target.voices}
        settings={settings}
        onChange={target.updateSettings}
        speakOn={target.speakOn}
        outputDevice={target.outputDevice}
      />
    </main>
  );
}

function describeSpeechError(error: unknown): string {
  if (error instanceof EmptyTextError) return "Type something to speak first.";
  if (error instanceof SpeechUnsupportedError) return error.message;
  if (error instanceof DesktopSpeechError || error instanceof DesktopRequestError) return error.message;
  return "Could not speak that. Please try again.";
}
