import type { UiLanguage } from "../protocol";
import type { Action } from "./actions";
import type { Phrase } from "./phrase";
import { KEYS_PER_PAGE, MAX_BOARD_PAGES, MAX_KEY_LABEL_LENGTH, BOARD_COLUMNS, makeBoard, type Board, type Key } from "./board";
import { DEFAULT_PHRASES_BY_LANGUAGE } from "../use-cases/phrases";

/** Id of the built-in communication board, so it can be restored in place. */
export const DEFAULT_BOARD_ID = "communication";

/** Name of the built-in communication board in each interface language. */
export const DEFAULT_BOARD_NAMES: Readonly<Record<UiLanguage, string>> = {
  es: "Comunicación",
  en: "Communication",
};

/** The actions placed on the last row of the communication board, in order. */
export const COMMUNICATION_ACTIONS: readonly Action[] = [
  { type: "voice.stop" },
  { type: "voice.repeat" },
  { type: "captions.clear" },
  { type: "captions.toggle" },
  { type: "voice.toggleLanguage" },
];

/** The communication board for a new install: the default phrases plus the communication actions. */
export function buildDefaultBoard(language: UiLanguage): Board {
  const phraseKeys: Key[] = DEFAULT_PHRASES_BY_LANGUAGE[language].map((text, slot) => ({ slot, action: { type: "voice.speak", text } }));
  return withCommunicationActions(phraseKeys, language);
}

/**
 * The communication board built from phrases saved by older versions. Phrases keep their slots; the
 * communication actions go on the last row of the first page whose last row is free.
 */
export function boardFromPhrases(phrases: readonly Phrase[], language: UiLanguage): Board {
  const keys = phrases.map((phrase): Key => {
    const label = phrase.label?.trim().slice(0, MAX_KEY_LABEL_LENGTH).trim();
    const action: Action = { type: "voice.speak", text: phrase.text.trim() };
    return label ? { slot: phrase.slot, label, action } : { slot: phrase.slot, action };
  });
  return withCommunicationActions(keys, language);
}

function withCommunicationActions(keys: Key[], language: UiLanguage): Board {
  const used = new Set(keys.map((key) => key.slot));
  const start = lastRowStart(used);
  const actionKeys =
    start === null ? [] : COMMUNICATION_ACTIONS.map((action, index): Key => ({ slot: start + index, action }));
  return makeBoard(DEFAULT_BOARD_ID, DEFAULT_BOARD_NAMES[language], [...keys, ...actionKeys]);
}

/** First slot of the first page whose last row is completely free, or null when every page is busy. */
function lastRowStart(used: ReadonlySet<number>): number | null {
  for (let page = 0; page < MAX_BOARD_PAGES; page += 1) {
    const start = (page + 1) * KEYS_PER_PAGE - BOARD_COLUMNS;
    const row = Array.from({ length: Math.min(BOARD_COLUMNS, COMMUNICATION_ACTIONS.length) }, (_, index) => start + index);
    if (row.every((slot) => !used.has(slot))) return start;
  }
  return null;
}
