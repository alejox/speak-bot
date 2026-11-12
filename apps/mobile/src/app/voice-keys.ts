import type { ActionType, Board, BoardKind } from "@speed-deck/core";

/**
 * Commands the Voice space no longer shows: captions are managed in OBS, Stop floats beside the keys while
 * speech plays, Repeat is gone and the voice language is changed in Settings. Keys stored with them stay
 * stored (nothing is deleted); they are neither drawn on Voice boards nor offered for new Voice keys.
 */
const HIDDEN_ON_VOICE: ReadonlySet<ActionType> = new Set<ActionType>(["captions.clear", "captions.toggle", "voice.repeat", "voice.stop", "voice.toggleLanguage"]);

/** Whether a key with an action of `type` is hidden on a board of `kind` (and not offered there). */
export function isHiddenOnBoard(kind: BoardKind, type: ActionType): boolean {
  return kind === "voice" && HIDDEN_ON_VOICE.has(type);
}

/** The slots of the board's keys that are not drawn (see `isHiddenOnBoard`). */
export function hiddenKeySlots(board: Board): number[] {
  return board.keys.flatMap((key) => (isHiddenOnBoard(board.kind, key.action.type) ? [key.slot] : []));
}
