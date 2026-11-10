import { InvalidBoardError, parseAction, type Action } from "./actions";

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
export const MAX_BOARDS = 50;

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

/** A named set of keys, shown as pages of `columns` × `rows`. Keys are kept in slot order. */
export interface Board {
  readonly id: string;
  readonly name: string;
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
  if (typeof id !== "string" || id.trim() === "" || id.length > 100) throw new InvalidBoardError("id must be a non-empty string.");
  return id;
}

/** A validated board with its keys in slot order. */
export function makeBoard(id: string, name: string, keys: readonly Key[] = []): Board {
  return { id: parseBoardId(id), name: parseBoardName(name), columns: BOARD_COLUMNS, rows: BOARD_ROWS, keys: sortKeys(keys) };
}

export function sortKeys(keys: readonly Key[]): Key[] {
  return [...keys].sort((a, b) => a.slot - b.slot);
}

/**
 * Reads boards from stored or received data without ever throwing: invalid boards are dropped, and
 * so are invalid keys and keys whose slot an earlier key already uses. Board ids stay unique.
 */
export function readStoredBoards(value: unknown): Board[] {
  if (!Array.isArray(value)) return [];
  const boards: Board[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const board = readStoredBoard(candidate);
    if (board && !ids.has(board.id) && boards.length < MAX_BOARDS) {
      ids.add(board.id);
      boards.push(board);
    }
  }
  return boards;
}

function readStoredBoard(value: unknown): Board | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, keys } = value as Record<string, unknown>;
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
    return makeBoard(parseBoardId(id), parseBoardName(name), valid);
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
