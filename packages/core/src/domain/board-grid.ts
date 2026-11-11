import { keysPerPage, MAX_BOARD_PAGES, parseBoardGrid, sortKeys, type Board, type BoardGrid, type Key } from "./board";

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
 * `board` laid out on `grid`. Each key keeps its page, row and column when they exist in the new grid,
 * so growing never moves a key. Keys that no longer fit take, in reading order, the first free slot
 * from the start of their own page onward, opening new pages up to `MAX_BOARD_PAGES`. Throws
 * `BoardGridFullError` when there is no room for every key; no key is ever dropped.
 */
export function reflowBoard(board: Board, grid: BoardGrid): Board {
  const { columns, rows } = parseBoardGrid(grid);
  const oldSize = keysPerPage(board);
  const newSize = columns * rows;
  const slotLimit = newSize * MAX_BOARD_PAGES;
  const placed = new Map<number, Key>();
  const overflow: { key: Key; page: number }[] = [];

  for (const key of sortKeys(board.keys)) {
    const page = Math.floor(key.slot / oldSize);
    const index = key.slot % oldSize;
    const row = Math.floor(index / board.columns);
    const column = index % board.columns;
    const slot = page * newSize + row * columns + column;
    if (row < rows && column < columns && slot < slotLimit) placed.set(slot, { ...key, slot });
    else overflow.push({ key, page });
  }
  for (const { key, page } of overflow) {
    let slot = page * newSize;
    while (slot < slotLimit && placed.has(slot)) slot += 1;
    if (slot >= slotLimit) throw new BoardGridFullError(board.id, { columns, rows });
    placed.set(slot, { ...key, slot });
  }
  return { ...board, columns, rows, keys: sortKeys([...placed.values()]) };
}
