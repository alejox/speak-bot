import { ACTION_REGISTRY, actionsOf, InvalidBoardError, MAX_BOARD_ID_LENGTH, parseAction, type Action, type ActionCategory, type ActionType } from "./actions";

/** Keys per row and rows per page of a board until the user picks another grid. */
export const BOARD_COLUMNS = 5;
export const BOARD_ROWS = 3;
/** Keys per page of the default grid; a board's own page size is `keysPerPage(board)`. */
export const KEYS_PER_PAGE = BOARD_COLUMNS * BOARD_ROWS;
/** The smallest grid any board can have. */
export const MIN_BOARD_COLUMNS = 3;
export const MIN_BOARD_ROWS = 2;
/** The largest grid any board can have (a Voice board's); each kind has its own range (`BOARD_GRID_RANGES`). */
export const MAX_BOARD_COLUMNS = 10;
export const MAX_BOARD_ROWS = 8;
/** Pages per board. */
export const MAX_BOARD_PAGES = 100;
/**
 * Key slots per board: a 0-based index across all pages. Fixed by the largest grid of any kind, so whether
 * a slot is valid never depends on the current grid and no stored key is dropped when it changes.
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
/** Folders inside folders: a folder of a board is 1 deep, a folder inside it 2, and so on up to this. */
export const MAX_FOLDER_DEPTH = 3;
/** The slot of a folder's fixed Back key. */
export const FOLDER_BACK_SLOT = 0;
/** The Back key every folder holds on `FOLDER_BACK_SLOT`; it cannot be changed, moved or removed. */
export const FOLDER_BACK_KEY: Key = { slot: FOLDER_BACK_SLOT, action: { type: "nav.folderBack" } };

/** What a board is for: "voice" speaks for its user (and shows its captions), "deck" controls the computer (OBS). */
export const BOARD_KINDS = ["voice", "deck"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

/** The categories each kind offers for new keys, in library order. */
const ALLOWED_CATEGORIES: Readonly<Record<BoardKind, readonly ActionCategory[]>> = {
  voice: ["voice", "captions", "navigation"],
  deck: ["navigation", "obs", "system"],
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

/** Whether a key running `action` may sit on a board of `kind`: the action and, for a multi-action, every step. */
export function isKeyActionAllowedOnBoard(kind: BoardKind, action: Action): boolean {
  return isActionAllowedOnBoard(kind, action.type) && actionsOf(action).every((step) => isActionAllowedOnBoard(kind, step.type));
}

/** Throws `InvalidBoardError` when a board of `kind` may not hold a key running `action` (see `isKeyActionAllowedOnBoard`). */
export function assertKeyActionAllowedOnBoard(kind: BoardKind, action: Action): void {
  assertActionAllowedOnBoard(kind, action.type);
  for (const step of actionsOf(action)) assertActionAllowedOnBoard(kind, step.type);
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
  "headphones",
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
  "folder",
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
  /** Background color while the key's toggle is on, as `#rrggbb` (lowercase); `color` is used when absent. */
  readonly activeColor?: string;
  /**
   * Cells the key covers from its slot (its top-left cell) to the right and down, on the same page.
   * Absent for 1 × 1, the only size most actions allow (see `ActionDefinition.canSpan`).
   */
  readonly span?: KeySpan;
  readonly action: Action;
}

/** Rows and columns of cells a key covers. */
export interface KeySpan {
  readonly rows: number;
  readonly columns: number;
}

export const MAX_KEY_SPAN_ROWS = 3;
export const MAX_KEY_SPAN_COLUMNS = 2;
const SINGLE_CELL: KeySpan = { rows: 1, columns: 1 };

/** The cells a key covers; 1 × 1 when it has no span. */
export function keySpanOf(key: Pick<Key, "span">): KeySpan {
  return key.span ?? SINGLE_CELL;
}

function isSingleCell(span: KeySpan): boolean {
  return span.rows === 1 && span.columns === 1;
}

/**
 * The slots a block of `span` at `slot` covers on `grid`, top-left first, or null when it does not
 * fit inside that slot's page (it would cross the right or bottom edge).
 */
export function blockSlots(slot: number, span: KeySpan, grid: BoardGrid): number[] | null {
  const size = keysPerPage(grid);
  const index = slot % size;
  const row = Math.floor(index / grid.columns);
  const column = index % grid.columns;
  if (row + span.rows > grid.rows || column + span.columns > grid.columns) return null;
  const slots: number[] = [];
  for (let r = 0; r < span.rows; r += 1) {
    for (let c = 0; c < span.columns; c += 1) slots.push(slot + r * grid.columns + c);
  }
  return slots;
}

/**
 * Stored keys with every span made safe for `grid`: spans are clamped to the grid, and a block that
 * crosses its page or covers another key's slot or another block falls back to 1 × 1 (earlier slots
 * win). No key moves or is dropped. `keys` hold unique slots.
 */
function fitStoredKeySpans(keys: readonly Key[], grid: BoardGrid): Key[] {
  const used = new Set(keys.map((key) => key.slot));
  return sortKeys(keys).map((key) => {
    if (!key.span) return key;
    const span = { rows: Math.min(key.span.rows, grid.rows), columns: Math.min(key.span.columns, grid.columns) };
    const { span: _stored, action, ...rest } = key;
    const cells = isSingleCell(span) ? null : blockSlots(key.slot, span, grid);
    if (!cells || cells.slice(1).some((cell) => used.has(cell))) return { ...rest, action };
    for (const cell of cells) used.add(cell);
    return { ...rest, span, action };
  });
}

/**
 * A named set of keys, shown as pages of `columns` × `rows`. Keys are kept in slot order, and every
 * key's action is one its `kind` allows (see `isActionAllowedOnBoard`).
 */
export interface Board {
  readonly id: string;
  readonly name: string;
  readonly kind: BoardKind;
  /**
   * Set on a folder: the board whose folder key opens it. A folder has its parent's kind and grid, is never
   * listed with the other boards, and holds the fixed `FOLDER_BACK_KEY` on slot 0. Absent on every other board.
   */
  readonly parentId?: string;
  readonly columns: number;
  readonly rows: number;
  readonly keys: readonly Key[];
}

export { InvalidBoardError };

/** Keys per row and rows per page. Every board of one kind shares one grid. */
export interface BoardGrid {
  readonly columns: number;
  readonly rows: number;
}

export const DEFAULT_BOARD_GRID: BoardGrid = { columns: BOARD_COLUMNS, rows: BOARD_ROWS };

/** The grid sizes a user can pick for each kind: Voice boards hold many more keys (vocabulary). */
export interface BoardGridRange {
  readonly minColumns: number;
  readonly maxColumns: number;
  readonly minRows: number;
  readonly maxRows: number;
}

export const BOARD_GRID_RANGES: Readonly<Record<BoardKind, BoardGridRange>> = {
  deck: { minColumns: MIN_BOARD_COLUMNS, maxColumns: 8, minRows: MIN_BOARD_ROWS, maxRows: 5 },
  voice: { minColumns: MIN_BOARD_COLUMNS, maxColumns: MAX_BOARD_COLUMNS, minRows: MIN_BOARD_ROWS, maxRows: MAX_BOARD_ROWS },
};

/** Whether `value` is a grid a board of `kind` may have. */
export function isBoardGrid(value: unknown, kind: BoardKind): value is BoardGrid {
  if (typeof value !== "object" || value === null) return false;
  const { columns, rows } = value as Record<string, unknown>;
  const range = BOARD_GRID_RANGES[kind];
  return isIntegerIn(columns, range.minColumns, range.maxColumns) && isIntegerIn(rows, range.minRows, range.maxRows);
}

/** Validates untrusted input as the grid of a board of `kind`; throws `InvalidBoardError` with an English message. */
export function parseBoardGrid(input: unknown, kind: BoardKind): BoardGrid {
  if (!isBoardGrid(input, kind)) {
    const range = BOARD_GRID_RANGES[kind];
    throw new InvalidBoardError(
      `A ${kind} board needs columns from ${range.minColumns} to ${range.maxColumns} and rows from ${range.minRows} to ${range.maxRows}.`,
    );
  }
  return { columns: input.columns, rows: input.rows };
}

/** Keys on one page of a board (or grid). */
export function keysPerPage(grid: BoardGrid): number {
  return grid.columns * grid.rows;
}

/** The grid every board of `kind` shares: the first such board's, or the default one when there is none. */
export function gridOfBoards(boards: readonly Board[], kind: BoardKind): BoardGrid {
  const first = boards.find((board) => board.kind === kind);
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
 * Validates untrusted input as a key. Labels are trimmed and an empty label, icon, color or activeColor means
 * none. Throws `InvalidBoardError` with an English message on any problem.
 */
export function createKey(input: unknown): Key {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new InvalidBoardError("key must be an object.");
  const { slot, label, icon, color, activeColor, span, action } = input as Record<string, unknown>;
  assertKeySlot(slot);
  const key: { slot: number; label?: string; icon?: string; color?: string; activeColor?: string; span?: KeySpan; action: Action } = {
    slot,
    action: parseAction(action),
  };

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
  if (activeColor !== undefined && activeColor !== "") {
    if (!isHexColor(activeColor)) throw new InvalidBoardError("activeColor must be a hex color like #1a2b3c.");
    key.activeColor = activeColor.toLowerCase();
  }
  if (span !== undefined) {
    const parsed = parseKeySpan(span);
    if (!isSingleCell(parsed)) {
      if (!ACTION_REGISTRY[key.action.type].canSpan) throw new InvalidBoardError(`A key with the action ${key.action.type} covers one cell only.`);
      key.span = parsed;
    }
  }
  // Fixed property order keeps stored files and responses stable.
  const { action: parsed, ...rest } = key;
  return { ...rest, action: parsed };
}

function parseKeySpan(input: unknown): KeySpan {
  if (typeof input !== "object" || input === null) throw new InvalidBoardError("span must be an object.");
  const { rows, columns } = input as Record<string, unknown>;
  if (!isIntegerIn(rows, 1, MAX_KEY_SPAN_ROWS) || !isIntegerIn(columns, 1, MAX_KEY_SPAN_COLUMNS)) {
    throw new InvalidBoardError(`span must have 1 to ${MAX_KEY_SPAN_ROWS} rows and 1 to ${MAX_KEY_SPAN_COLUMNS} columns.`);
  }
  return { rows, columns };
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
 * kind does not allow. With `parentId` it is a folder: its keys must hold `FOLDER_BACK_KEY` on slot 0
 * (see `makeFolderBoard`); no other board may hold a Back key.
 */
export function makeBoard(
  id: string,
  name: string,
  kind: BoardKind,
  keys: readonly Key[] = [],
  grid: BoardGrid = DEFAULT_BOARD_GRID,
  parentId?: string,
): Board {
  const parsedKind = parseBoardKind(kind);
  const { columns, rows } = parseBoardGrid(grid, parsedKind);
  for (const key of keys) assertKeyActionAllowedOnBoard(parsedKind, key.action);
  const isFolder = parentId !== undefined;
  for (const key of keys) {
    const isBack = key.action.type === "nav.folderBack";
    if (isBack && (!isFolder || key.slot !== FOLDER_BACK_SLOT)) throw new InvalidBoardError("Only slot 0 of a folder holds a Back key.");
    if (isFolder && key.slot === FOLDER_BACK_SLOT && !isBack) throw new InvalidBoardError("Slot 0 of a folder holds its Back key.");
  }
  if (isFolder && !keys.some((key) => key.slot === FOLDER_BACK_SLOT)) throw new InvalidBoardError("A folder needs its Back key on slot 0.");
  const base = { id: parseBoardId(id), name: parseBoardName(name), kind: parsedKind };
  const parent = isFolder ? { parentId: parseBoardId(parentId) } : {};
  return { ...base, ...parent, columns, rows, keys: sortKeys(keys) };
}

/** An empty folder of `parent`: its kind and grid, with only the Back key. */
export function makeFolderBoard(id: string, name: string, parent: Board): Board {
  return makeBoard(id, name, parent.kind, [FOLDER_BACK_KEY], parent, parent.id);
}

/** Whether `board` is a folder (see `Board.parentId`). */
export function isFolderBoard(board: Board): boolean {
  return board.parentId !== undefined;
}

export function sortKeys(keys: readonly Key[]): Key[] {
  return [...keys].sort((a, b) => a.slot - b.slot);
}

/** A stored board whose id, name and keys are valid; `kind` is undefined when it was stored before boards had one. */
interface StoredBoard {
  readonly id: string;
  readonly name: string;
  readonly kind: BoardKind | undefined;
  readonly parentId: string | undefined;
  /** The stored grid as read; checked against the board's kind once that is known. */
  readonly grid: { readonly columns: unknown; readonly rows: unknown };
  readonly keys: readonly Key[];
}

/**
 * Reads boards from stored or received data without ever throwing: invalid boards are dropped, and
 * so are invalid keys and keys whose slot an earlier key already uses. Board ids stay unique.
 *
 * Boards stored before boards had a kind get one from their keys, and a board holding keys its kind
 * does not allow is split in two (see `boardsOfStoredBoard`), so no valid key is ever lost. Caption
 * keys stored on deck boards are read as they are, so loading never fails before
 * `moveCaptionKeysToVoice` moves them. Every board takes the grid of the first board of its kind (that
 * board's stored one when valid for the kind, else 5 × 3), since boards of one kind share one; a key span
 * that does not fit falls back to 1 × 1.
 * Reading the result again changes nothing.
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
  // Boards of one kind share one grid: the first board of that kind's, when valid for the kind.
  const grids: Partial<Record<BoardKind, BoardGrid>> = {};
  for (const board of stored) {
    const kind = storedKindOf(board);
    grids[kind] ??= isBoardGrid(board.grid, kind) ? { columns: board.grid.columns, rows: board.grid.rows } : DEFAULT_BOARD_GRID;
  }
  const gridOf = (kind: BoardKind) => grids[kind] ?? DEFAULT_BOARD_GRID;
  const boards: Board[] = [];
  for (const board of stored) {
    const read = boardsOfStoredBoard(board, gridOf, ids).map((one) => ({ ...one, keys: fitStoredKeySpans(one.keys, one) }));
    // A split board is kept whole or not at all, so it is never stored half migrated.
    if (boards.length + read.length > MAX_STORED_BOARDS) break;
    boards.push(...read);
  }
  return withValidFolders(boards);
}

/**
 * `boards` without the folders that cannot be reached: a folder whose parent is missing or of another
 * kind, one too deep (see `MAX_FOLDER_DEPTH`) or in a loop of parents, and every folder inside those.
 */
function withValidFolders(boards: readonly Board[]): Board[] {
  const byId = new Map(boards.map((board) => [board.id, board]));
  const depthOf = (board: Board): number | null => {
    let depth = 0;
    for (let current = board; current.parentId !== undefined; depth += 1) {
      const parent = byId.get(current.parentId);
      if (!parent || parent.kind !== current.kind || depth >= MAX_FOLDER_DEPTH) return null;
      current = parent;
    }
    return depth;
  };
  return boards.filter((board) => depthOf(board) !== null);
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
function boardsOfStoredBoard(board: StoredBoard, gridOf: (kind: BoardKind) => BoardGrid, takenIds: Set<string>): Board[] {
  if (board.parentId !== undefined) return board.kind ? [makeStoredFolder(board, board.kind, gridOf(board.kind), board.parentId)] : [];
  const kind = storedKindOf(board);
  const moved = board.keys.filter((key) => !isActionReadOnBoard(kind, key.action.type));
  if (moved.length === 0) return [makeStoredBoard(board.id, board.name, kind, board.keys, gridOf(kind))];
  const kept = board.keys.filter((key) => isActionReadOnBoard(kind, key.action.type));
  // Every action is allowed on at least one kind, so the other kind takes what this one refuses.
  const otherKind: BoardKind = kind === "voice" ? "deck" : "voice";
  const suffixes = SPLIT_SUFFIXES[otherKind];
  const splitId = freeSplitId(board.id, suffixes.id, takenIds);
  takenIds.add(splitId);
  const splitName = `${truncate(board.name, MAX_BOARD_NAME_LENGTH - suffixes.name.length).trimEnd()}${suffixes.name}`;
  return [makeStoredBoard(board.id, board.name, kind, kept, gridOf(kind)), makeBoard(splitId, splitName, otherKind, moved, gridOf(otherKind))];
}

/**
 * A stored folder as it must be: keys its kind allows, the Back key on slot 0 and nowhere else. Folders
 * are never split (they never existed before board kinds), so a key its kind refuses is dropped.
 */
function makeStoredFolder(board: StoredBoard, kind: BoardKind, grid: BoardGrid, parentId: string): Board {
  const keys = board.keys.filter(
    (key) => key.slot !== FOLDER_BACK_SLOT && key.action.type !== "nav.folderBack" && isKeyActionAllowedOnBoard(kind, key.action),
  );
  return makeBoard(board.id, board.name, kind, [FOLDER_BACK_KEY, ...keys], grid, parentId);
}

/** The kind a stored board is read as: its own, or the one its keys give a board stored before boards had one. */
function storedKindOf(board: StoredBoard): BoardKind {
  return board.kind ?? kindOfLegacyKeys(board.keys);
}

/** Like `makeBoard`, but also keeps the keys a kind only reads from storage (see `STORED_ONLY_CATEGORIES`). */
function makeStoredBoard(id: string, name: string, kind: BoardKind, keys: readonly Key[], grid: BoardGrid): Board {
  // A Back key belongs to folders only.
  const kept = keys.filter((key) => key.action.type !== "nav.folderBack");
  const allowed = kept.filter((key) => isKeyActionAllowedOnBoard(kind, key.action));
  const board = makeBoard(id, name, kind, allowed, grid);
  return allowed.length === kept.length ? board : { ...board, keys: sortKeys(kept) };
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
  const { id, name, kind, parentId, columns, rows, keys } = value as Record<string, unknown>;
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
    return {
      id: parseBoardId(id),
      name: parseBoardName(name),
      kind: isBoardKind(kind) ? kind : undefined,
      parentId: parentId === undefined ? undefined : parseBoardId(parentId),
      grid: { columns, rows },
      keys: valid,
    };
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
