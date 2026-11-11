import { isFolderBoard, type Board } from "./board";

/** The boards a user picks from (lists, menus, the first board shown): every board that is not a folder. */
export function visibleBoards<T extends Board>(boards: readonly T[]): T[] {
  return boards.filter((board) => !isFolderBoard(board));
}

/** How many folders deep `board` is: 0 for a board, 1 for its folder, 2 for a folder inside that… */
export function folderDepth(boards: readonly Board[], board: Board): number {
  return folderPath(boards, board.id).length - 1;
}

/**
 * The board `boardId` and the boards it is inside, outermost first (e.g. [Deck, Scenes]), for a breadcrumb.
 * Empty when there is no such board; it stops at a parent that is missing.
 */
export function folderPath(boards: readonly Board[], boardId: string): Board[] {
  const byId = new Map(boards.map((board) => [board.id, board]));
  const path: Board[] = [];
  const seen = new Set<string>();
  for (let current = byId.get(boardId); current && !seen.has(current.id); current = current.parentId ? byId.get(current.parentId) : undefined) {
    seen.add(current.id);
    path.unshift(current);
  }
  return path;
}

/** The ids of the folders the keys of `board` open. */
export function folderIdsOpenedBy(board: Board): string[] {
  return board.keys.flatMap((key) => (key.action.type === "nav.openFolder" ? [key.action.folderId] : []));
}

/**
 * `boards` without the folders no key opens any more, and without everything inside those: removing a
 * folder removes its keys, so the folders they opened go too. Boards that are not folders always stay.
 */
export function withoutUnreferencedFolders(boards: readonly Board[]): Board[] {
  let current = [...boards];
  for (;;) {
    const opened = new Set(current.flatMap(folderIdsOpenedBy));
    const next = current.filter((board) => !isFolderBoard(board) || opened.has(board.id));
    if (next.length === current.length) return current;
    current = next;
  }
}
