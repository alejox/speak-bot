import { InvalidBoardError } from "../domain/actions";
import {
  assertKeySlot,
  BoardNotFoundError,
  createKey,
  KeyNotFoundError,
  LastBoardError,
  makeBoard,
  MAX_BOARDS,
  parseBoardName,
  sortKeys,
  type Board,
  type Key,
} from "../domain/board";
import { boardFromPhrases, buildDefaultBoard, DEFAULT_BOARD_ID } from "../domain/default-board";
import { SlotOccupiedError, type Phrase } from "../domain/phrase";
import type { BoardRepository } from "../ports/board-repository";
import type { UiLanguage } from "../protocol";

export interface BoardDependencies {
  repository: BoardRepository;
  generateId: () => string;
}

export function listBoards(repository: BoardRepository): Promise<Board[]> {
  return repository.list();
}

/**
 * Creates the first board when there is none: the communication board built from `legacyPhrases`
 * (phrases saved by older versions) when given, otherwise the default one in `language`.
 * Resolves true when it created a board.
 */
export async function initializeBoards(
  { repository }: Pick<BoardDependencies, "repository">,
  { language, legacyPhrases }: { language: UiLanguage; legacyPhrases: readonly Phrase[] | null },
): Promise<boolean> {
  return repository.update((boards) => {
    if (boards.length > 0) return { result: false };
    const board = legacyPhrases ? boardFromPhrases(legacyPhrases, language) : buildDefaultBoard(language);
    return { boards: [board], result: true };
  });
}

export async function createBoard({ repository, generateId }: BoardDependencies, { name }: { name: unknown }): Promise<Board> {
  const board = makeBoard(generateId(), parseBoardName(name));
  return repository.update((boards) => {
    if (boards.length >= MAX_BOARDS) throw new InvalidBoardError(`There can be at most ${MAX_BOARDS} boards.`);
    if (boards.some((other) => other.id === board.id)) throw new InvalidBoardError("A board with this id already exists.");
    return { boards: [...boards, board], result: board };
  });
}

export async function renameBoard(repository: BoardRepository, id: string, name: unknown): Promise<Board> {
  const parsed = parseBoardName(name);
  return changeBoard(repository, id, (board) => ({ ...board, name: parsed }));
}

/** Rejects with `LastBoardError` when `id` is the only board. */
export async function deleteBoard(repository: BoardRepository, id: string): Promise<void> {
  return repository.update((boards) => {
    if (!boards.some((board) => board.id === id)) throw new BoardNotFoundError(id);
    if (boards.length === 1) throw new LastBoardError();
    return { boards: boards.filter((board) => board.id !== id), result: undefined };
  });
}

/**
 * Puts a key (`slot`, label, icon, color, action; validated) on a board. A slot that already holds a
 * key rejects with `SlotOccupiedError` unless `replace` is true.
 */
export async function setKey(repository: BoardRepository, boardId: string, input: unknown, { replace = false } = {}): Promise<Key> {
  const key = createKey(input);
  await changeBoard(repository, boardId, (board) => {
    if (!replace && board.keys.some((other) => other.slot === key.slot)) throw new SlotOccupiedError(key.slot);
    return { ...board, keys: [...board.keys.filter((other) => other.slot !== key.slot), key] };
  });
  return key;
}

/** Empties a slot; an already empty slot is fine. */
export async function clearKey(repository: BoardRepository, boardId: string, slot: number): Promise<void> {
  assertKeySlot(slot);
  await changeBoard(repository, boardId, (board) => ({ ...board, keys: board.keys.filter((key) => key.slot !== slot) }));
}

/** Moves the key at `from` to `to`; a key already at `to` takes its place at `from`. */
export async function moveKey(repository: BoardRepository, boardId: string, from: number, to: number): Promise<Board> {
  assertKeySlot(from);
  assertKeySlot(to);
  return changeBoard(repository, boardId, (board) => {
    const moving = board.keys.find((key) => key.slot === from);
    if (!moving) throw new KeyNotFoundError(from);
    if (from === to) return board;
    const keys = board.keys.map((key) => {
      if (key.slot === from) return { ...key, slot: to };
      if (key.slot === to) return { ...key, slot: from };
      return key;
    });
    return { ...board, keys };
  });
}

/** Puts back the built-in communication board in `language`, in place, or first when it was deleted. */
export async function restoreDefaultBoard(repository: BoardRepository, language: UiLanguage): Promise<Board> {
  const fresh = buildDefaultBoard(language);
  return repository.update((boards) => {
    const index = boards.findIndex((board) => board.id === DEFAULT_BOARD_ID);
    const next = index === -1 ? [fresh, ...boards] : boards.map((board, at) => (at === index ? fresh : board));
    return { boards: next, result: fresh };
  });
}

function changeBoard(repository: BoardRepository, id: string, change: (board: Board) => Board): Promise<Board> {
  return repository.update((boards) => {
    const current = boards.find((board) => board.id === id);
    if (!current) throw new BoardNotFoundError(id);
    const changed = change(current);
    const next = { ...changed, keys: sortKeys(changed.keys) };
    return { boards: boards.map((board) => (board.id === id ? next : board)), result: next };
  });
}
