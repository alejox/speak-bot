import { ACTION_REGISTRY, InvalidBoardError, MAX_BOARD_ID_LENGTH, parseAction, type Action, type ActionCategory, type ActionType } from "./actions";

/** Keys per row and rows per page of a board until the user picks another grid. */
export const BOARD_COLUMNS = 5;
export const BOARD_ROWS = 3;
/** Keys per page of the default grid; a board's own page size is `keysPerPage(board)`. */
export const KEYS_PER_PAGE = BOARD_COLUMNS * BOARD_ROWS;
/** The grid sizes a user can pick. */
export const MIN_BOARD_COLUMNS = 3;
export const MAX_BOARD_COLUMNS = 8;
export const MIN_BOARD_ROWS = 2;
export const MAX_BOARD_ROWS = 5;
/** Pages per board. */
export const MAX_BOARD_PAGES = 100;
/**
 * Key slots per board: a 0-based index across all pages. Fixed by the largest grid, so whether a slot
 * is valid never depends on the current grid and no stored key is dropped when it changes.
 */
export const MAX_KEY_SLOTS = MAX_BOARD_COLUMNS * MAX_BOARD_ROWS * MAX_BOARD_PAGES;
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

/** What a board is for: "voice" speaks for its user (and shows its captions), "deck" controls the computer (OBS). */
export const BOARD_KINDS = ["voice", "deck"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

/** The categories each kind offers for new keys, in library order. */
const ALLOWED_CATEGORIES: Readonly<Record<BoardKind, readonly ActionCategory[]>> = {
  voice: ["voice", "captions", "navigation"],
  deck: ["navigation", "obs"],
};

/**
 * Categories a kind no longer allows but still reads from storage, so boards saved by earlier versions
 * load unchanged until `moveCaptionKeysToVoice` moves those keys: captions belonged to deck boards
 * before they moved to Voice. Only `readStoredBoards` uses this; editing never accepts them.
 */
const STORED_ONLY_CATEGORIES: Readonly<Record<BoardKind, readonly ActionCategory[]>> = {
  voice: [],
  deck: ["captions"],
};

export function isBoardKind(value: unknown): value is BoardKind {
  return typeof value === "string" && (BOARD_KINDS as readonly string[]).includes(value);
}

export function parseBoardKind(kind: unknown): BoardKind {
  if (!isBoardKind(kind)) throw new InvalidBoardError(`kind must be one of: ${BOARD_KINDS.join(", ")}.`);
  return kind;
}

/** The action categories offered for new keys on a board of `kind`, in library order. */
export function allowedActionCategories(kind: BoardKind): readonly ActionCategory[] {
  return ALLOWED_CATEGORIES[kind];
}

/** Whether a key with an action of `actionType` may sit on a board of `kind`: one of the categories it offers. */
export function isActionAllowedOnBoard(kind: BoardKind, actionType: ActionType): boolean {
  return ALLOWED_CATEGORIES[kind].includes(ACTION_REGISTRY[actionType].category);
}

/** Whether a stored key with an action of `actionType` is read as is on a board of `kind` (see `STORED_ONLY_CATEGORIES`). */
function isActionReadOnBoard(kind: BoardKind, actionType: ActionType): boolean {
  return isActionAllowedOnBoard(kind, actionType) || STORED_ONLY_CATEGORIES[kind].includes(ACTION_REGISTRY[actionType].category);
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

/** Keys per row and rows per page. Every board shares one grid. */
export interface BoardGrid {
  readonly columns: number;
  readonly rows: number;
}

export const DEFAULT_BOARD_GRID: BoardGrid = { columns: BOARD_COLUMNS, rows: BOARD_ROWS };

export function isBoardGrid(value: unknown): value is BoardGrid {
  if (typeof value !== "object" || value === null) return false;
  const { columns, rows } = value as Record<string, unknown>;
  return isIntegerIn(columns, MIN_BOARD_COLUMNS, MAX_BOARD_COLUMNS) && isIntegerIn(rows, MIN_BOARD_ROWS, MAX_BOARD_ROWS);
}

/** Validates untrusted input as a grid; throws `InvalidBoardError` with an English message. */
export function parseBoardGrid(input: unknown): BoardGrid {
  if (!isBoardGrid(input)) {
    throw new InvalidBoardError(
      `columns must be an integer from ${MIN_BOARD_COLUMNS} to ${MAX_BOARD_COLUMNS} and rows from ${MIN_BOARD_ROWS} to ${MAX_BOARD_ROWS}.`,
    );
  }
  return { columns: input.columns, rows: input.rows };
}

/** Keys on one page of a board (or grid). */
export function keysPerPage(grid: BoardGrid): number {
  return grid.columns * grid.rows;
}

/** The grid every board shares: the first board's, or the default one when there is no board. */
export function gridOfBoards(boards: readonly Board[]): BoardGrid {
  const first = boards[0];
  return first ? { columns: first.columns, rows: first.rows } : DEFAULT_BOARD_GRID;
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

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

/**
 * A validated board of `kind` and `grid` with its keys in slot order. Rejects a key whose action the
 * kind does not allow.
 */
export function makeBoard(id: string, name: string, kind: BoardKind, keys: readonly Key[] = [], grid: BoardGrid = DEFAULT_BOARD_GRID): Board {
  const parsedKind = parseBoardKind(kind);
  const { columns, rows } = parseBoardGrid(grid);
  for (const key of keys) assertActionAllowedOnBoard(parsedKind, key.action.type);
  return { id: parseBoardId(id), name: parseBoardName(name), kind: parsedKind, columns, rows, keys: sortKeys(keys) };
}

export function sortKeys(keys: readonly Key[]): Key[] {
  return [...keys].sort((a, b) => a.slot - b.slot);
}

/** A stored board whose id, name and keys are valid; `kind` is undefined when it was stored before boards had one. */
interface StoredBoard {
  readonly id: string;
  readonly name: string;
  readonly kind: BoardKind | undefined;
  /** The stored grid when valid, else the default one. */
  readonly grid: BoardGrid;
  readonly keys: readonly Key[];
}

/**
 * Reads boards from stored or received data without ever throwing: invalid boards are dropped, and
 * so are invalid keys and keys whose slot an earlier key already uses. Board ids stay unique.
 *
 * Boards stored before boards had a kind get one from their keys, and a board holding keys its kind
 * does not allow is split in two (see `boardsOfStoredBoard`), so no valid key is ever lost. Caption
 * keys stored on deck boards are read as they are, so loading never fails before
 * `moveCaptionKeysToVoice` moves them. Every board takes the first board's grid (its stored one when
 * valid, else 5 × 3), since all boards share one. Reading the result again changes nothing.
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
  const grid = stored[0]?.grid ?? DEFAULT_BOARD_GRID;
  const boards: Board[] = [];
  for (const board of stored) {
    const read = boardsOfStoredBoard({ ...board, grid }, ids);
    // A split board is kept whole or not at all, so it is never stored half migrated.
    if (boards.length + read.length > MAX_STORED_BOARDS) break;
    boards.push(...read);
  }
  return boards;
}

/** How the board split out of a board of the other kind is told apart from it. */
const SPLIT_SUFFIXES: Readonly<Record<BoardKind, { readonly id: string; readonly name: string }>> = {
  voice: { id: "-voice", name: " (Voice)" },
  deck: { id: "-deck", name: " (Deck)" },
};

/**
 * Turns a stored board into boards whose keys their kind allows, never moving or dropping a key.
 * The board keeps its id, name, kind and every key that kind allows; the others move, in the same
 * slots, to a new board of the other kind placed right after it: `<id>-deck` named `<name> (Deck)`
 * for a voice board, `<id>-voice` named `<name> (Voice)` for a deck board.
 *
 * A board stored without a kind is a deck board when it has no voice keys and at least one OBS or
 * caption key, and a voice board otherwise.
 * `takenIds` holds every board id in use; the id of a new board is added to it.
 */
function boardsOfStoredBoard(board: StoredBoard, takenIds: Set<string>): Board[] {
  const kind = board.kind ?? kindOfLegacyKeys(board.keys);
  const moved = board.keys.filter((key) => !isActionReadOnBoard(kind, key.action.type));
  if (moved.length === 0) return [makeStoredBoard(board.id, board.name, kind, board.keys, board.grid)];
  const kept = board.keys.filter((key) => isActionReadOnBoard(kind, key.action.type));
  // Every action is allowed on at least one kind, so the other kind takes what this one refuses.
  const otherKind: BoardKind = kind === "voice" ? "deck" : "voice";
  const suffixes = SPLIT_SUFFIXES[otherKind];
  const splitId = freeSplitId(board.id, suffixes.id, takenIds);
  takenIds.add(splitId);
  const splitName = `${truncate(board.name, MAX_BOARD_NAME_LENGTH - suffixes.name.length).trimEnd()}${suffixes.name}`;
  return [makeStoredBoard(board.id, board.name, kind, kept, board.grid), makeBoard(splitId, splitName, otherKind, moved, board.grid)];
}

/** Like `makeBoard`, but also keeps the keys a kind only reads from storage (see `STORED_ONLY_CATEGORIES`). */
function makeStoredBoard(id: string, name: string, kind: BoardKind, keys: readonly Key[], grid: BoardGrid): Board {
  const allowed = keys.filter((key) => isActionAllowedOnBoard(kind, key.action.type));
  const board = makeBoard(id, name, kind, allowed, grid);
  return allowed.length === keys.length ? board : { ...board, keys: sortKeys(keys) };
}

function kindOfLegacyKeys(keys: readonly Key[]): BoardKind {
  // Decided by category rather than by what each kind accepts today, so these boards keep the kind they
  // were always read with (a board of caption keys only stayed a deck board when captions moved to Voice).
  const categories = new Set(keys.map((key) => ACTION_REGISTRY[key.action.type].category));
  return !categories.has("voice") && (categories.has("obs") || categories.has("captions")) ? "deck" : "voice";
}

/** `<id><suffix>`, then `<id><suffix>-2`, `<id><suffix>-3`… until free; the original id is shortened to keep the limit. */
function freeSplitId(id: string, suffix: string, takenIds: ReadonlySet<string>): string {
  for (let attempt = 1; ; attempt += 1) {
    const ending = attempt === 1 ? suffix : `${suffix}-${attempt}`;
    const candidate = `${truncate(id, MAX_BOARD_ID_LENGTH - ending.length)}${ending}`;
    if (!takenIds.has(candidate)) return candidate;
  }
}

/** The start of `text`, at most `maxLength` UTF-16 units long, never ending in half a surrogate pair. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const lastKept = text.charCodeAt(maxLength - 1);
  const endsInHighSurrogate = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, endsInHighSurrogate ? maxLength - 1 : maxLength);
}

function readStoredBoard(value: unknown): StoredBoard | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, kind, columns, rows, keys } = value as Record<string, unknown>;
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
    const grid = isBoardGrid({ columns, rows }) ? { columns: columns as number, rows: rows as number } : DEFAULT_BOARD_GRID;
    return { id: parseBoardId(id), name: parseBoardName(name), kind: isBoardKind(kind) ? kind : undefined, grid, keys: valid };
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
