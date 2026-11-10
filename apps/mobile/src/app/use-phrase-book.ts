import {
  DEFAULT_PHRASES_BY_LANGUAGE,
  deletePhrase,
  listPhrases,
  restoreDefaultPhrases,
  savePhrase,
  seedDefaultPhrases,
  type Phrase,
  type UiLanguage,
} from "@speak-bot/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../i18n/messages";
import type { SpeechTarget } from "./use-speech-target";

export interface PhraseBook {
  phrases: Phrase[];
  /** Saves `text` as a phrase. Resolves true when it was saved. */
  add: (text: string) => Promise<boolean>;
  remove: (phrase: Phrase) => Promise<void>;
  /** Replaces every phrase with the default set in the interface language. */
  restoreDefaults: () => Promise<void>;
}

type PhraseTarget = Pick<SpeechTarget, "phrases" | "isRemote" | "isFirstRun" | "onPhrasesChanged" | "restoreRemotePhrases">;

/** The saved phrases of the current target (this device or the desktop), seeded on first run. */
export function usePhraseBook(target: PhraseTarget, language: UiLanguage, report: (message: Message) => void): PhraseBook {
  const { phrases: phraseDeps, isFirstRun, onPhrasesChanged, restoreRemotePhrases } = target;
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  // Shared across StrictMode's double effect run so defaults are seeded once, before the first list.
  const seeding = useRef<Promise<unknown> | null>(null);
  // Read when seeding, without reloading phrases on every language change.
  const languageRef = useRef(language);
  languageRef.current = language;
  const reportRef = useRef(report);
  reportRef.current = report;

  const refresh = useCallback(async () => {
    setPhrases(await listPhrases(phraseDeps.repository));
  }, [phraseDeps]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const loaded = await listPhrases(phraseDeps.repository);
      if (active) setPhrases(loaded);
    };
    void (async () => {
      if (!target.isRemote) {
        seeding.current ??= isFirstRun()
          ? seedDefaultPhrases(phraseDeps, DEFAULT_PHRASES_BY_LANGUAGE[languageRef.current])
          : Promise.resolve();
        await seeding.current;
      }
      await load();
    })().catch(() => {
      if (active) reportRef.current({ key: "status.loadFailed" });
    });
    const unsubscribe = onPhrasesChanged(() => void load().catch(() => {}));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [phraseDeps, target.isRemote, isFirstRun, onPhrasesChanged]);

  return {
    phrases,
    add: async (text) => {
      const trimmed = text.trim();
      if (trimmed === "") {
        report({ key: "status.typeToSave" });
        return false;
      }
      if (phrases.some((phrase) => phrase.text === trimmed)) {
        report({ key: "status.duplicate" });
        return false;
      }
      try {
        await savePhrase(phraseDeps, { text: trimmed });
        await refresh();
      } catch {
        report({ key: "status.saveFailed" });
        return false;
      }
      report({ key: "status.saved" });
      return true;
    },
    remove: async (phrase) => {
      try {
        await deletePhrase(phraseDeps.repository, phrase.id);
        await refresh();
      } catch {
        report({ key: "status.deleteFailed" });
        return;
      }
      report({ key: "status.deleted", params: { text: phrase.label ?? phrase.text } });
    },
    restoreDefaults: async () => {
      try {
        if (restoreRemotePhrases) await restoreRemotePhrases(language);
        else await restoreDefaultPhrases(phraseDeps, DEFAULT_PHRASES_BY_LANGUAGE[language]);
        await refresh();
      } catch {
        report({ key: "status.restoreFailed" });
        return;
      }
      report({ key: "status.restored" });
    },
  };
}
