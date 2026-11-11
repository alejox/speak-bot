import type { UiLanguage } from "../protocol";
import { ACTION_REGISTRY, MAX_BOARD_ID_LENGTH, type ActionType } from "./actions";
import { gridOfBoards, keysPerPage, MAX_BOARD_PAGES, MAX_STORED_BOARDS, sortKeys, type Board, type Key } from "./board";
import { buildDefaultBoard, communicationKeysStart, COMMUNICATION_KEYS, DEFAULT_BOARD_ID } from "./default-board";

/** A caption key that moved from a deck board to a voice board. */
export interface MovedCaptionKey {
  readonly fromBoardId: string;
  readonly fromSlot: number;
  readonly toBoardId: string;
  readonly toSlot: number;
  readonly actionType: ActionType;
}

/** A caption key removed from a deck board because the voice board already has a key with its action. */
export interface DroppedCaptionKey {
  readonly fromBoardId: string;
  readonly fromSlot: number;
  readonly toBoardId: string;
  readonly actionType: ActionType;
}

/** A caption key left on its deck board because no voice board had room for it. */
export interface KeptCaptionKey {
  readonly fromBoardId: string;
  readonly fromSlot: number;
  readonly actionType: ActionType;
}

export interface CaptionMigrationReport {
  /** Whether the boards changed; false means there was nothing to move. */
  readonly changed: boolean;
  readonly moved: readonly MovedCaptionKey[];
  readonly dropped: readonly DroppedCaptionKey[];
  readonly kept: readonly KeptCaptionKey[];
  /** Id of the communication board created to take the caption keys, or null. */
  readonly createdBoardId: string | null;
}

/**
 * Moves the caption keys stored on deck boards (captions belong to Voice) to a voice board: the
 * communication board, or the first voice board when it was deleted. A key keeps its look and goes
 * to its own slot when free on the first page, else to the slot the default board gives its action
 * (the last slots of the first page, columns 2 and 3 of the last row in a 5-column grid), else to the other one of those, else to the first free slot of the
 * board's pages, else to a new page. A key whose action the voice board already has is dropped
 * instead of doubled. With no voice board at all, the default communication board in `language`
 * (which has the caption keys) is created first. A key that fits nowhere stays on its deck board,
 * so no key is ever lost. Pure, and running it again on its result changes nothing.
 */
export function moveCaptionKeysToVoice(
  boards: readonly Board[],
  language: UiLanguage,
): { boards: Board[]; report: CaptionMigrationReport } {
  const moved: MovedCaptionKey[] = [];
  const dropped: DroppedCaptionKey[] = [];
  const kept: KeptCaptionKey[] = [];
  const unchanged = { boards: [...boards], report: { changed: false, moved, dropped, kept, createdBoardId: null } };
  if (!boards.some((board) => board.kind === "deck" && board.keys.some(isCaptionKey))) return unchanged;

  let next = [...boards];
  let createdBoardId: string | null = null;
  let targetIndex = next.findIndex((board) => board.kind === "voice" && board.id === DEFAULT_BOARD_ID);
  if (targetIndex === -1) targetIndex = next.findIndex((board) => board.kind === "voice");
  if (targetIndex === -1 && next.length < MAX_STORED_BOARDS) {
    const seed = buildDefaultBoard(language, gridOfBoards(next, "voice"));
    const created = { ...seed, id: freeBoardId(seed.id, new Set(next.map((board) => board.id))) };
    // The communication board goes first, as when it is restored.
    next = [created, ...next];
    createdBoardId = created.id;
    targetIndex = 0;
  }

  const target = targetIndex === -1 ? null : next[targetIndex]!;
  const targetKeys: Key[] = target ? [...target.keys] : [];
  next = next.map((board) => {
    if (board.kind !== "deck" || !board.keys.some(isCaptionKey)) return board;
    const keys = board.keys.filter((key) => {
      if (!isCaptionKey(key)) return true;
      const from = { fromBoardId: board.id, fromSlot: key.slot, actionType: key.action.type };
      if (!target) {
        kept.push(from);
        return true;
      }
      if (targetKeys.some((other) => other.action.type === key.action.type)) {
        dropped.push({ ...from, toBoardId: target.id });
        return false;
      }
      const slot = freeSlotFor(key, targetKeys, keysPerPage(target));
      if (slot === null) {
        kept.push(from);
        return true;
      }
      targetKeys.push({ ...key, slot });
      moved.push({ ...from, toBoardId: target.id, toSlot: slot });
      return false;
    });
    return keys.length === board.keys.length ? board : { ...board, keys };
  });
  if (target && targetKeys.length !== target.keys.length) next[targetIndex] = { ...target, keys: sortKeys(targetKeys) };

  const changed = moved.length > 0 || dropped.length > 0 || createdBoardId !== null;
  if (!changed) return unchanged;
  return { boards: next, report: { changed, moved, dropped, kept, createdBoardId } };
}

function isCaptionKey(key: Key): boolean {
  return ACTION_REGISTRY[key.action.type].category === "captions";
}

/** Where a caption key goes on a voice board of `pageSize` keys per page holding `keys`, or null when the board is full. */
function freeSlotFor(key: Key, keys: readonly Key[], pageSize: number): number | null {
  const used = new Set(keys.map((other) => other.slot));
  const lastRow = communicationKeysStart(pageSize);
  const seedSlots = COMMUNICATION_KEYS.filter(({ action }) => ACTION_REGISTRY[action.type].category === "captions").map(({ column, action }) => ({
    slot: lastRow + column,
    type: action.type,
  }));
  const preferred = [
    ...(key.slot < pageSize ? [key.slot] : []),
    ...seedSlots.filter(({ type }) => type === key.action.type).map(({ slot }) => slot),
    ...seedSlots.map(({ slot }) => slot),
  ];
  const fromPreferred = preferred.find((slot) => !used.has(slot));
  if (fromPreferred !== undefined) return fromPreferred;
  const pages = keys.length === 0 ? 1 : Math.floor(Math.max(...used) / pageSize) + 1;
  for (let slot = 0; slot < pages * pageSize; slot += 1) if (!used.has(slot)) return slot;
  return pages < MAX_BOARD_PAGES ? pages * pageSize : null;
}

/** `id`, or `id-2`, `id-3`… when taken. */
function freeBoardId(id: string, taken: ReadonlySet<string>): string {
  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? id : `${id}-${attempt}`.slice(0, MAX_BOARD_ID_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }
}
