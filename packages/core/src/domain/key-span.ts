import { blockSlots, keySpanOf, keysPerPage, type Board, type BoardGrid, type Key, type KeySpan } from "./board";

/** A key, or a block of cells it covers, would not fit: another key is in the way or it crosses the page edge. */
export class NoRoomForKeyError extends Error {
  constructor(readonly slot: number) {
    super(`There is no room for a key this size at slot ${slot}.`);
    this.name = "NoRoomForKeyError";
  }
}

/** Which key (by its slot) uses each cell of a board's keys on `grid`. */
export function cellOwners(keys: readonly Key[], grid: BoardGrid): Map<number, number> {
  const owners = new Map<number, number>();
  for (const key of keys) {
    for (const cell of blockSlots(key.slot, keySpanOf(key), grid) ?? [key.slot]) owners.set(cell, key.slot);
  }
  return owners;
}

/** The cells a board's spanning keys cover besides their own slots; no other key may sit there. */
export function coveredSlots(board: Board): Set<number> {
  const covered = new Set<number>();
  for (const [cell, owner] of cellOwners(board.keys, board)) if (cell !== owner) covered.add(cell);
  return covered;
}

/** The first slot of a page (0-based) that holds no key and no part of one, or null when the page is full. */
export function firstFreeSlotOnPage(board: Board, page: number): number | null {
  const owners = cellOwners(board.keys, board);
  const size = keysPerPage(board);
  for (let slot = page * size; slot < (page + 1) * size; slot += 1) if (!owners.has(slot)) return slot;
  return null;
}

/** `key` covering `span` cells; a 1 × 1 span is stored as none. */
export function withKeySpan(key: Key, span: KeySpan): Key {
  const { span: _old, action, ...rest } = key;
  return span.rows === 1 && span.columns === 1 ? { ...rest, action } : { ...rest, span, action };
}

/**
 * The keys of `board` with `key` put at its slot, `replacing` the key already there. Throws
 * `NoRoomForKeyError` when its block crosses the page edge or covers a cell another key uses.
 */
export function placeKey(board: Board, key: Key, { replacing }: { replacing: boolean }): Key[] {
  const others = replacing ? board.keys.filter((other) => other.slot !== key.slot) : board.keys;
  const cells = blockSlots(key.slot, keySpanOf(key), board);
  const owners = cellOwners(others, board);
  if (!cells || cells.some((cell) => owners.has(cell))) throw new NoRoomForKeyError(key.slot);
  return [...others, key];
}

/**
 * The keys of `board` with the key at `from` moved to `to`. Its whole block must have room there; a
 * 1 × 1 key on `to` itself swaps to `from` when the rest of the block is free and `from` is outside it.
 * Throws `NoRoomForKeyError` otherwise. `from` must hold a key.
 */
export function moveKeyBlock(board: Board, from: number, to: number): Key[] {
  const moving = board.keys.find((key) => key.slot === from)!;
  const others = board.keys.filter((key) => key !== moving);
  const cells = blockSlots(to, keySpanOf(moving), board);
  if (!cells) throw new NoRoomForKeyError(to);
  const owners = cellOwners(others, board);
  const inTheWay = new Set(cells.flatMap((cell) => (owners.has(cell) ? [owners.get(cell)!] : [])));
  if (inTheWay.size === 0) return [...others, { ...moving, slot: to }];
  const target = others.find((key) => key.slot === to);
  const canSwap = inTheWay.size === 1 && target !== undefined && !target.span && !cells.includes(from);
  if (!canSwap) throw new NoRoomForKeyError(to);
  return others.map((key) => (key === target ? { ...key, slot: from } : key)).concat({ ...moving, slot: to });
}
