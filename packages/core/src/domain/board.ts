import { ACTION_REGISTRY, InvalidBoardError, MAX_BOARD_ID_LENGTH, parseAction, type Action, type ActionCategory, type ActionType } from "./actions";

/** Keys per row and rows per page of every board. */
export const BOARD_COLUMNS = 5;
export const BOARD_ROWS = 3;
export const KEYS_PER_PAGE = BOARD_COLUMNS * BOARD_ROWS;
/** Pages per board. */
export const MAX_BOARD_PAGES = 100;
/** Key slots per board: a 0-based index across all pages. */
export const MAX_KEY_SLOTS = KEYS_PER_PAGE * MAX_BOARD_PAGES;
export const MAX_KEY_LABEL_LENGTH = 40;
export const MAX_BOARD_NAME_LENGTH = 40;
export const MAX_ICON_ID_LENGTH = 40;
/** Most boards a user can have; creating or restoring one past it is refused. */
export const MAX_BOARDS = 50;
/**
 * Most boards read from storage. Twice `MAX_BOARDS` because giving stored boards a kind may split
 * every one of them in two, and a split must never cost the user a key.
 */
export const MAX_STORED_BOARDS = MAX_BOARDS * 2;

/** What a board is for: "voice" speaks for its user, "deck" controls the computer (OBS, captions). */
export const BOARD_KINDS = ["voice", "deck"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

const ALLOWED_CATEGORIES: Readonly<Record<BoardKind, readonly ActionCategory[]>> = {
  voice: ["voice", "navigation"],
  deck: ["captions", "navigation", "obs"],
};

export function isBoardKind(value: unknown): value is BoardKind {
  return typeof value === "string" && (BOARD_KINDS as readonly string[]).includes(value);
}

export function parseBoardKind(kind: unknown): BoardKind {
  if (!isBoardKind(kind)) throw new InvalidBoardError(`kind must be one of: ${BOARD_KINDS.join(", ")}.`);
  return kind;
}

/** The action categories a board of `kind` may hold, in library order. */
export function allowedActionCategories(kind: BoardKind): readonly ActionCategory[] {
  return ALLOWED_CATEGORIES[kind];
}

/** Whether a key with an action of `actionType` may sit on a board of `kind`. */
export function isActionAllowedOnBoard(kind: BoardKind, actionType: ActionType): boolean {
  return ALLOWED_CATEGORIES[kind].includes(ACTION_REGISTRY[actionType].category);
}

/** Throws `InvalidBoardError` when a board of `kind` may not hold an action of `actionType`. */
export function assertActionAllowedOnBoard(kind: BoardKind, actionType: ActionType): void {
  if (!isActionAllowedOnBoard(kind, actionType)) throw new InvalidBoardError(`A ${kind} board cannot hold the action ${actionType}.`);
}

/** Icon ids a key may show; the clients draw them. */
export const KEY_ICON_IDS = [
  "message",
  "stop",
  "repeat",
  "language",
  "eraser",
  "captions",
  "captions-off",
  "arrow-left",
  "arrow-right",
  "page",
  "board",
  "scene",
  "mic",
  "mic-off",
  "broadcast",
  "record",
  "eye",
  "eye-off",
  "heart",
  "hand",
  "check",
  "cross",
  "question",
  "star",
  "smile",
  "water",
  "coffee",
  "clock",
  "bell",
  "music",
] as const;
export type KeyIconId = (typeof KEY_ICON_IDS)[number];

/** One key of a board: what it shows and what it does. */
export interface Key {
  /** Position on the board: a 0-based index across all pages, unique per board. */
  readonly slot: number;
  readonly label?: string;
  /** One of `KEY_ICON_IDS`; when absent the action's default icon is shown. */
  readonly icon?: string;
  /** Background color as `#rrggbb` (lowercase). */
  readonly color?: string;
  readonly action: Action;
}

/**
 * A named set of keys, shown as pages of `columns` × `rows`. Keys are kept in slot order, and every
 * key's action is one its `kind` allows (see `isActionAllowedOnBoard`).
 */
export interface Board {
  readonly id: string;
  readonly name: string;
  readonly kind: BoardKind;
  readonly columns: number;
  readonly rows: number;
  readonly keys: readonly Key[];
}

export { InvalidBoardError };

export class BoardNotFoundError extends Error {
  constructor(readonly id: string) {
    super("Board not found.");
    this.name = "BoardNotFoundError";
  }
}

export class KeyNotFoundError extends Error {
  constructor(readonly slot: number) {
    super(`Slot ${slot} is empty.`);
    this.name = "KeyNotFoundError";
  }
}

/** There are already `MAX_BOARDS` boards. */
export class BoardLimitError extends Error {
  constructor() {
    super(`There can be at most ${MAX_BOARDS} boards.`);
    this.name = "BoardLimitError";
  }
}

/** Every user keeps at least one board. */
export class LastBoardError extends Error {
  constructor() {
    super("The last board cannot be deleted.");
    this.name = "LastBoardError";
  }
}

export function isValidKeySlot(slot: unknown): slot is number {
  return typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < MAX_KEY_SLOTS;
}

export function isKeyIconId(value: unknown): value is KeyIconId {
  return typeof value === "string" && value.length <= MAX_ICON_ID_LENGTH && (KEY_ICON_IDS as readonly string[]).includes(value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function assertKeySlot(slot: unknown): asserts slot is number {
  if (!isValidKeySlot(slot)) throw new InvalidBoardError(`slot must be an integer from 0 to ${MAX_KEY_SLOTS - 1}.`);
}

/**
 * Validates untrusted input as a key. Labels are trimmed and an empty label, icon or color means
 * none. Throws `InvalidBoardError` with an English message on any problem.
 */
export function createKey(input: unknown): Key {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new InvalidBoardError("key must be an object.");
  const { slot, label, icon, color, action } = input as Record<string, unknown>;
  assertKeySlot(slot);
  const key: { slot: number; label?: string; icon?: string; color?: string; action: Action } = { slot, action: parseAction(action) };

  if (label !== undefined) {
    if (typeof label !== "string") throw new InvalidBoardError("label must be a string.");
    const trimmed = label.trim();
    if (trimmed.length > MAX_KEY_LABEL_LENGTH) throw new InvalidBoardError(`label must be at most ${MAX_KEY_LABEL_LENGTH} characters.`);
    if (trimmed) key.label = trimmed;
  }
  if (icon !== undefined && icon !== "") {
    if (!isKeyIconId(icon)) throw new InvalidBoardError("icon is not a known icon id.");
    key.icon = icon;
  }
  if (color !== undefined && color !== "") {
    if (!isHexColor(color)) throw new InvalidBoardError("color must be a hex color like #1a2b3c.");
    key.color = color.toLowerCase();
  }
  // Fixed property order keeps stored files and responses stable.
  const { action: parsed, ...rest } = key;
  return { ...rest, action: parsed };
}

export function parseBoardName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") throw new InvalidBoardError("name must be a non-empty string.");
  const trimmed = name.trim();
  if (trimmed.length > MAX_BOARD_NAME_LENGTH) throw new InvalidBoardError(`name must be at most ${MAX_BOARD_NAME_LENGTH} characters.`);
  return trimmed;
}

export function parseBoardId(id: unknown): string {
  if (typeof id !== "string" || id.trim() === "" || id.length > MAX_BOARD_ID_LENGTH) throw new InvalidBoardError("id must be a non-empty string.");
  return id;
}

/** A validated board of `kind` with its keys in slot order. Rejects a key whose action the kind does not allow. */
export function makeBoard(id: string, name: string, kind: BoardKind, keys: readonly Key[] = []): Board {
  const parsedKind = parseBoardKind(kind);
  for (const key of keys) assertActionAllowedOnBoard(parsedKind, key.action.type);
  return { id: parseBoardId(id), name: parseBoardName(name), kind: parsedKind, columns: BOARD_COLUMNS, rows: BOARD_ROWS, keys: sortKeys(keys) };
}

export function sortKeys(keys: readonly Key[]): Key[] {
  return [...keys].sort((a, b) => a.slot - b.slot);
}

/** A stored board whose id, name and keys are valid; `kind` is undefined when it was stored before boards had one. */
interface StoredBoard {
  readonly id: string;
  readonly name: string;
  readonly kind: BoardKind | undefined;
  readonly keys: readonly Key[];
}

/**
 * Reads boards from stored or received data without ever throwing: invalid boards are dropped, and
 * so are invalid keys, keys whose slot an earlier key already uses and keys the board's kind does
 * not allow. Board ids stay unique.
 *
 * Boards stored before boards had a kind get one from their keys (see `boardsOfLegacyBoard`), which
 * may split a board in two. Reading the result again changes nothing.
 */
export function readStoredBoards(value: unknown): Board[] {
  if (!Array.isArray(value)) return [];
  const stored: StoredBoard[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const board = readStoredBoard(candidate);
    if (board && !ids.has(board.id)) {
      ids.add(board.id);
      stored.push(board);
    }
  }
  const boards: Board[] = [];
  for (const board of stored) {
    const read =
      board.kind === undefined
        ? boardsOfLegacyBoard(board, ids)
        : [makeBoard(board.id, board.name, board.kind, board.keys.filter((key) => isActionAllowedOnBoard(board.kind!, key.action.type)))];
    // A split board is kept whole or not at all, so it is never stored half migrated.
    if (boards.length + read.length > MAX_STORED_BOARDS) break;
    boards.push(...read);
  }
  return boards;
}

/**
 * Gives a board stored without a kind one, never moving or dropping a key:
 * - only voice and navigation keys, or no keys → a voice board;
 * - no voice keys and at least one OBS or caption key → a deck board;
 * - both → the board becomes a voice board with its voice and navigation keys, followed by a new
 *   deck board `<id>-deck` named `<name> (Deck)` with its OBS and caption keys in the same slots.
 * `takenIds` holds every board id in use; the id of a new deck board is added to it.
 */
function boardsOfLegacyBoard(board: StoredBoard, takenIds: Set<string>): Board[] {
  const deckOnly = board.keys.filter((key) => !isActionAllowedOnBoard("voice", key.action.type));
  if (deckOnly.length === 0) return [makeBoard(board.id, board.name, "voice", board.keys)];
  if (board.keys.every((key) => isActionAllowedOnBoard("deck", key.action.type))) return [makeBoard(board.id, board.name, "deck", board.keys)];
  const voiceKeys = board.keys.filter((key) => isActionAllowedOnBoard("voice", key.action.type));
  const deckId = splitDeckId(board.id, takenIds);
  takenIds.add(deckId);
  return [makeBoard(board.id, board.name, "voice", voiceKeys), makeBoard(deckId, splitDeckName(board.name), "deck", deckOnly)];
}

/** `<id>-deck`, then `<id>-deck-2`, `<id>-deck-3`… until free; the original id is shortened to keep the limit. */
function splitDeckId(id: string, takenIds: ReadonlySet<string>): string {
  for (let attempt = 1; ; attempt += 1) {
    const suffix = attempt === 1 ? "-deck" : `-deck-${attempt}`;
    const candidate = `${id.slice(0, MAX_BOARD_ID_LENGTH - suffix.length)}${suffix}`;
    if (!takenIds.has(candidate)) return candidate;
  }
}

function splitDeckName(name: string): string {
  const suffix = " (Deck)";
  return `${name.slice(0, MAX_BOARD_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

function readStoredBoard(value: unknown): StoredBoard | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, kind, keys } = value as Record<string, unknown>;
  try {
    const slots = new Set<number>();
    const valid: Key[] = [];
    for (const candidate of Array.isArray(keys) ? keys : []) {
      const key = tryCreateKey(candidate);
      if (key && !slots.has(key.slot)) {
        slots.add(key.slot);
        valid.push(key);
      }
    }
    return { id: parseBoardId(id), name: parseBoardName(name), kind: isBoardKind(kind) ? kind : undefined, keys: valid };
  } catch {
    return null;
  }
}

function tryCreateKey(value: unknown): Key | null {
  try {
    return createKey(value);
  } catch {
    return null;
  }
}
