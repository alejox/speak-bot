import { InvalidBoardError } from "../domain/actions";
import {
  assertActionAllowedOnBoard,
  assertKeySlot,
  BoardLimitError,
  BoardNotFoundError,
  createKey,
  gridOfBoards,
  KeyNotFoundError,
  LastBoardError,
  makeBoard,
  MAX_BOARDS,
  parseBoardGrid,
  parseBoardKind,
  parseBoardName,
  sortKeys,
  type Board,
  type Key,
} from "../domain/board";
import { reflowBoard } from "../domain/board-grid";
import { moveKeyBlock, placeKey } from "../domain/key-span";
import { moveCaptionKeysToVoice, type CaptionMigrationReport } from "../domain/caption-migration";
import { boardFromPhrases, buildDefaultBoard, buildDefaultDeckBoard, DEFAULT_BOARD_ID, DEFAULT_DECK_BOARD_ID } from "../domain/default-board";
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
 * Creates the first boards when there is none: the communication board, built from `legacyPhrases`
 * (phrases saved by older versions) when given and otherwise the default one in `language`, followed
 * by the default deck board. Resolves true when it created them.
 */
export async function initializeBoards(
  { repository }: Pick<BoardDependencies, "repository">,
  { language, legacyPhrases }: { language: UiLanguage; legacyPhrases: readonly Phrase[] | null },
): Promise<boolean> {
  return repository.update((boards) => {
    if (boards.length > 0) return { result: false };
    const voice = legacyPhrases ? boardFromPhrases(legacyPhrases, language) : buildDefaultBoard(language);
    return { boards: [voice, buildDefaultDeckBoard(language)], result: true };
  });
}

/**
 * Moves the caption keys stored on deck boards to a voice board (see `moveCaptionKeysToVoice`) and
 * stores the result, only when something moved. Run it when boards are loaded, after
 * `initializeBoards`; running it again stores nothing.
 */
export async function moveCaptionKeysToVoiceBoards(
  { repository }: Pick<BoardDependencies, "repository">,
  { language }: { language: UiLanguage },
): Promise<CaptionMigrationReport> {
  return repository.update((boards) => {
    const { boards: next, report } = moveCaptionKeysToVoice(boards, language);
    return report.changed ? { boards: next, result: report } : { result: report };
  });
}

/** Creates an empty board of `kind` ("voice" or "deck") with the grid boards of that kind share. */
export async function createBoard({ repository, generateId }: BoardDependencies, { name, kind }: { name: unknown; kind: unknown }): Promise<Board> {
  const parsedName = parseBoardName(name);
  const parsedKind = parseBoardKind(kind);
  const id = generateId();
  return repository.update((boards) => {
    const board = makeBoard(id, parsedName, parsedKind, [], gridOfBoards(boards, parsedKind));
    if (boards.length >= MAX_BOARDS) throw new BoardLimitError();
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
 * Puts a key (`slot`, label, icon, color, action; validated) on a board. An action the board's kind
 * does not allow rejects with `InvalidBoardError`. A slot that already holds a key rejects with
 * `SlotOccupiedError` unless `replace` is true. A key whose cells (see `Key.span`) cross the page edge
 * or meet another key or a cell another key covers rejects with `NoRoomForKeyError`.
 */
export async function setKey(repository: BoardRepository, boardId: string, input: unknown, { replace = false } = {}): Promise<Key> {
  const key = createKey(input);
  await changeBoard(repository, boardId, (board) => {
    assertActionAllowedOnBoard(board.kind, key.action.type);
    if (!replace && board.keys.some((other) => other.slot === key.slot)) throw new SlotOccupiedError(key.slot);
    return { ...board, keys: placeKey(board, key, { replacing: replace }) };
  });
  return key;
}

/** Empties a slot; an already empty slot is fine. */
export async function clearKey(repository: BoardRepository, boardId: string, slot: number): Promise<void> {
  assertKeySlot(slot);
  await changeBoard(repository, boardId, (board) => ({ ...board, keys: board.keys.filter((key) => key.slot !== slot) }));
}

/**
 * Moves the key at `from` to `to`; a 1 × 1 key already at `to` takes its place at `from`. A move
 * without room for the key's whole block rejects with `NoRoomForKeyError` (see `moveKeyBlock`).
 */
export async function moveKey(repository: BoardRepository, boardId: string, from: number, to: number): Promise<Board> {
  assertKeySlot(from);
  assertKeySlot(to);
  return changeBoard(repository, boardId, (board) => {
    const moving = board.keys.find((key) => key.slot === from);
    if (!moving) throw new KeyNotFoundError(from);
    if (from === to) return board;
    return { ...board, keys: moveKeyBlock(board, from, to) };
  });
}

/**
 * Puts back a built-in board in `language`: the communication board, or the deck board when `id` is
 * `DEFAULT_DECK_BOARD_ID`, with the grid boards of its kind share. It is restored in place; when it was deleted, the communication board
 * goes first and the deck board right after the communication board (last when there is none).
 * Rejects with `BoardLimitError` when it was deleted and there is no room for it.
 */
export async function restoreDefaultBoard(repository: BoardRepository, language: UiLanguage, id: unknown = DEFAULT_BOARD_ID): Promise<Board> {
  if (id !== DEFAULT_BOARD_ID && id !== DEFAULT_DECK_BOARD_ID) throw new InvalidBoardError("boardId is not a built-in board.");
  return repository.update((boards) => {
    const fresh = id === DEFAULT_BOARD_ID ? buildDefaultBoard(language, gridOfBoards(boards, "voice")) : buildDefaultDeckBoard(language, gridOfBoards(boards, "deck"));
    const index = boards.findIndex((board) => board.id === fresh.id);
    if (index !== -1) return { boards: boards.map((board, at) => (at === index ? fresh : board)), result: fresh };
    if (boards.length >= MAX_BOARDS) throw new BoardLimitError();
    if (fresh.id === DEFAULT_BOARD_ID) return { boards: [fresh, ...boards], result: fresh };
    const voiceIndex = boards.findIndex((board) => board.id === DEFAULT_BOARD_ID);
    const at = voiceIndex === -1 ? boards.length : voiceIndex + 1;
    return { boards: [...boards.slice(0, at), fresh, ...boards.slice(at)], result: fresh };
  });
}

/**
 * Gives every board of one kind the grid `input` (`{ kind, columns, rows }`, validated against that kind's
 * range) in one write, laying out each board's keys with `reflowBoard`; boards of the other kind are left
 * as they are. Rejects with `BoardGridFullError`, writing nothing, when a board's keys do not fit.
 * Resolves with every board; writes nothing when the grid does not change.
 */
export async function setBoardGrid(repository: BoardRepository, input: unknown): Promise<Board[]> {
  const kind = parseBoardKind(typeof input === "object" && input !== null ? (input as { kind?: unknown }).kind : undefined);
  const grid = parseBoardGrid(input, kind);
  return repository.update((boards) => {
    const resized = boards.filter((board) => board.kind === kind);
    if (resized.every((board) => board.columns === grid.columns && board.rows === grid.rows)) return { result: [...boards] };
    const next = boards.map((board) => (board.kind === kind ? reflowBoard(board, grid) : board));
    return { boards: next, result: next };
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
