import {
  DEFAULT_PHRASES_BY_LANGUAGE,
  deletePhrase,
  listPhrases,
  restoreDefaultPhrases,
  savePhrase,
  seedDefaultPhrases,
  SlotOccupiedError,
  updatePhrase,
  type Phrase,
  type UiLanguage,
} from "@speed-deck/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopRequestError } from "../adapters/desktop-api";
import type { Message } from "../i18n/messages";
import type { SpeechTarget } from "./use-speech-target";

/** What the phrase editor lets the user change. */
export interface PhraseValues {
  text: string;
  /** Empty for no label. */
  label: string;
}

export interface PhraseBook {
  /** In deck (slot) order. */
  phrases: Phrase[];
  /** Saves `text` as a phrase in the first free deck key. Resolves true when it was saved. */
  add: (text: string) => Promise<boolean>;
  /** Saves a new phrase into the deck key `slot`. Resolves true when it was saved. */
  addAt: (slot: number, values: PhraseValues) => Promise<boolean>;
  /** Changes the text and label of a phrase. Resolves true when it was saved. */
  edit: (phrase: Phrase, values: PhraseValues) => Promise<boolean>;
  /** Resolves true when the phrase was deleted. */
  remove: (phrase: Phrase) => Promise<boolean>;
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
      } catch (error) {
        report(describeSaveError(error));
        return false;
      }
      report({ key: "status.saved" });
      return true;
    },
    addAt: async (slot, values) => {
      try {
        await savePhrase(phraseDeps, { text: values.text, label: values.label, slot });
        await refresh();
      } catch (error) {
        report(describeSaveError(error));
        return false;
      }
      report({ key: "status.saved" });
      return true;
    },
    edit: async (phrase, values) => {
      try {
        await updatePhrase(phraseDeps.repository, phrase.id, { text: values.text, label: values.label });
        await refresh();
      } catch (error) {
        report(describeSaveError(error));
        return false;
      }
      report({ key: "status.updated" });
      return true;
    },
    remove: async (phrase) => {
      try {
        await deletePhrase(phraseDeps.repository, phrase.id);
        await refresh();
      } catch {
        report({ key: "status.deleteFailed" });
        return false;
      }
      report({ key: "status.deleted", params: { text: phrase.label ?? phrase.text } });
      return true;
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

function describeSaveError(error: unknown): Message {
  const occupied = error instanceof SlotOccupiedError || (error instanceof DesktopRequestError && error.code === "slot-occupied");
  return { key: occupied ? "status.slotOccupied" : "status.saveFailed" };
}
