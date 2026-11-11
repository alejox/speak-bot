import { blockSlots, keySpanOf, keysPerPage, MAX_BOARD_PAGES, parseBoardGrid, sortKeys, type Board, type BoardGrid, type Key } from "./board";
import { withKeySpan } from "./key-span";

/** A board's keys do not all fit in the requested grid, even on new pages. */
export class BoardGridFullError extends Error {
  constructor(
    readonly boardId: string,
    readonly grid: BoardGrid,
  ) {
    super(`The keys of a board do not fit in a grid of ${grid.columns} × ${grid.rows}.`);
    this.name = "BoardGridFullError";
  }
}

/**
 * `board` laid out on `grid`. A key spanning several cells moves as one block, its span clamped to the
 * grid. Each key keeps its page, row and column when its whole block fits there in the new grid, so
 * growing never moves a key. Keys that no longer fit take, in reading order, the first place from the
 * start of their own page onward where their whole block is free, opening new pages up to
 * `MAX_BOARD_PAGES`. Throws `BoardGridFullError` when there is no room for every key; no key is ever dropped.
 */
export function reflowBoard(board: Board, grid: BoardGrid): Board {
  const { columns, rows } = parseBoardGrid(grid);
  const target = { columns, rows };
  const oldSize = keysPerPage(board);
  const newSize = columns * rows;
  const slotLimit = newSize * MAX_BOARD_PAGES;
  const used = new Set<number>();
  const placed: Key[] = [];
  const overflow: { key: Key; page: number }[] = [];
  const tryPlace = (key: Key, slot: number): boolean => {
    const cells = blockSlots(slot, keySpanOf(key), target);
    if (!cells || cells.some((cell) => used.has(cell))) return false;
    for (const cell of cells) used.add(cell);
    placed.push({ ...key, slot });
    return true;
  };

  for (const stored of sortKeys(board.keys)) {
    const span = keySpanOf(stored);
    const key = withKeySpan(stored, { rows: Math.min(span.rows, rows), columns: Math.min(span.columns, columns) });
    const page = Math.floor(key.slot / oldSize);
    const index = key.slot % oldSize;
    const row = Math.floor(index / board.columns);
    const column = index % board.columns;
    const slot = page * newSize + row * columns + column;
    const kept = row < rows && column < columns && slot < slotLimit && tryPlace(key, slot);
    if (!kept) overflow.push({ key, page });
  }
  for (const { key, page } of overflow) {
    let slot = page * newSize;
    while (slot < slotLimit && !tryPlace(key, slot)) slot += 1;
    if (slot >= slotLimit) throw new BoardGridFullError(board.id, target);
  }
  return { ...board, columns, rows, keys: sortKeys(placed) };
}
