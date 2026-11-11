import type { UiLanguage } from "../protocol";
import type { Action } from "./actions";
import type { Phrase } from "./phrase";
import { DEFAULT_BOARD_GRID, keysPerPage, MAX_BOARD_PAGES, MAX_KEY_LABEL_LENGTH, makeBoard, type Board, type BoardGrid, type Key } from "./board";
import { DEFAULT_PHRASES_BY_LANGUAGE } from "../use-cases/phrases";

/** Id of the built-in communication board, so it can be restored in place. */
export const DEFAULT_BOARD_ID = "communication";

/** Name of the built-in communication board in each interface language. */
export const DEFAULT_BOARD_NAMES: Readonly<Record<UiLanguage, string>> = {
  es: "Comunicación",
  en: "Communication",
};

/** Id of the built-in deck board, so it can be restored in place. */
export const DEFAULT_DECK_BOARD_ID = "deck";

/** Name of the built-in deck board in each interface language. */
export const DEFAULT_DECK_BOARD_NAMES: Readonly<Record<UiLanguage, string>> = {
  es: "Deck",
  en: "Deck",
};

/**
 * The voice and caption commands on the last five slots of a page of the communication board, by
 * position among those slots: their column on the last row when the grid has five columns. The
 * caption keys are back in the columns they had before boards had a kind, now that captions belong to Voice.
 */
export const COMMUNICATION_KEYS: readonly { readonly column: number; readonly action: Action }[] = [
  { column: 0, action: { type: "voice.stop" } },
  { column: 1, action: { type: "voice.repeat" } },
  { column: 2, action: { type: "captions.clear" } },
  { column: 3, action: { type: "captions.toggle" } },
  { column: 4, action: { type: "voice.toggleLanguage" } },
];

/** The actions on the built-in deck board, from its first slot: the OBS actions that need no parameters. */
export const DEFAULT_DECK_ACTIONS: readonly Action[] = [
  { type: "obs.toggleStream" },
  { type: "obs.toggleRecord" },
];

/** The communication (voice) board for a new install: the default phrases plus the voice and caption commands. */
export function buildDefaultBoard(language: UiLanguage, grid: BoardGrid = DEFAULT_BOARD_GRID): Board {
  const phraseKeys: Key[] = DEFAULT_PHRASES_BY_LANGUAGE[language].map((text, slot) => ({ slot, action: { type: "voice.speak", text } }));
  return withCommunicationKeys(phraseKeys, language, grid);
}

/** The deck board for a new install. */
export function buildDefaultDeckBoard(language: UiLanguage, grid: BoardGrid = DEFAULT_BOARD_GRID): Board {
  const keys = DEFAULT_DECK_ACTIONS.map((action, slot): Key => ({ slot, action }));
  return makeBoard(DEFAULT_DECK_BOARD_ID, DEFAULT_DECK_BOARD_NAMES[language], "deck", keys, grid);
}

/** The boards of a new install, in display order. */
export function buildDefaultBoards(language: UiLanguage): Board[] {
  return [buildDefaultBoard(language), buildDefaultDeckBoard(language)];
}

/**
 * The communication board built from phrases saved by older versions. Phrases keep their slots; the
 * voice commands go on the last five slots of the first page where they are free.
 */
export function boardFromPhrases(phrases: readonly Phrase[], language: UiLanguage): Board {
  const keys = phrases.map((phrase): Key => {
    const label = phrase.label?.trim().slice(0, MAX_KEY_LABEL_LENGTH).trim();
    const action: Action = { type: "voice.speak", text: phrase.text.trim() };
    return label ? { slot: phrase.slot, label, action } : { slot: phrase.slot, action };
  });
  return withCommunicationKeys(keys, language);
}

function withCommunicationKeys(keys: Key[], language: UiLanguage, grid: BoardGrid = DEFAULT_BOARD_GRID): Board {
  const start = commandSlotsStart(new Set(keys.map((key) => key.slot)), keysPerPage(grid));
  const commandKeys = start === null ? [] : COMMUNICATION_KEYS.map(({ column, action }): Key => ({ slot: start + column, action }));
  return makeBoard(DEFAULT_BOARD_ID, DEFAULT_BOARD_NAMES[language], "voice", [...keys, ...commandKeys], grid);
}

/** First slot of the communication commands on a page of `pageSize` keys: its last `COMMUNICATION_KEYS.length` slots. */
export function communicationKeysStart(pageSize: number, page = 0): number {
  return (page + 1) * pageSize - COMMUNICATION_KEYS.length;
}

/** Start of the last slots of the first page where they are all free, or null when every page is busy. */
function commandSlotsStart(used: ReadonlySet<number>, pageSize: number): number | null {
  for (let page = 0; page < MAX_BOARD_PAGES; page += 1) {
    const start = communicationKeysStart(pageSize, page);
    const slots = COMMUNICATION_KEYS.map((_, index) => start + index);
    if (slots.every((slot) => !used.has(slot))) return start;
  }
  return null;
}
