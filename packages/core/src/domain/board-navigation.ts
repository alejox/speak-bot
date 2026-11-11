import type { ActionOf } from "./actions";
import { isHexColor, keysPerPage, type Board, type Key } from "./board";

/** Where a client is: which board and which page (0-based) it shows. Every client keeps its own. */
export interface BoardPosition {
  readonly boardId: string;
  readonly page: number;
}

export type NavigationAction = ActionOf<"nav.nextPage" | "nav.prevPage" | "nav.goToPage" | "nav.goToBoard">;

/** Pages needed to show every key of `board`; at least one. */
export function boardPageCount(board: Board): number {
  const highest = board.keys.reduce((max, key) => Math.max(max, key.slot), -1);
  return Math.max(1, Math.floor(highest / keysPerPage(board)) + 1);
}

/** The keys of one page (0-based) by position on the page, `columns × rows` of them; empty slots are undefined. */
export function keysOnPage(board: Board, page: number): (Key | undefined)[] {
  const size = keysPerPage(board);
  const first = page * size;
  const bySlot = new Map(board.keys.map((key) => [key.slot, key]));
  return Array.from({ length: size }, (_, index) => bySlot.get(first + index));
}

/**
 * A position that exists: the saved board when it is still there (otherwise the first board), on a
 * page it has. Null when there is no board at all.
 */
export function resolveBoardPosition(boards: readonly Board[], position: BoardPosition | null): BoardPosition | null {
  const board = boards.find((candidate) => candidate.id === position?.boardId) ?? boards[0];
  if (!board) return null;
  const sameBoard = board.id === position?.boardId;
  const page = sameBoard ? clamp(Math.trunc(position.page) || 0, 0, boardPageCount(board) - 1) : 0;
  return { boardId: board.id, page };
}

/** Where a navigation key leads. Next and previous wrap around; a missing board leaves the position as it is. */
export function navigateBoard(boards: readonly Board[], position: BoardPosition, action: NavigationAction): BoardPosition {
  const board = boards.find((candidate) => candidate.id === position.boardId);
  if (!board) return resolveBoardPosition(boards, position) ?? position;
  const count = boardPageCount(board);
  switch (action.type) {
    case "nav.nextPage":
      return { boardId: board.id, page: (position.page + 1) % count };
    case "nav.prevPage":
      return { boardId: board.id, page: (position.page - 1 + count) % count };
    case "nav.goToPage":
      return { boardId: board.id, page: clamp(action.page - 1, 0, count - 1) };
    case "nav.goToBoard":
      return boards.some((candidate) => candidate.id === action.boardId) ? { boardId: action.boardId, page: 0 } : position;
  }
}

/** Black or white, whichever reads better on a key of `color` (`#rrggbb`); white for anything else. */
export function contrastTextColor(color: string): "#000000" | "#ffffff" {
  if (!isHexColor(color)) return "#ffffff";
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  // Contrast with black is (L + 0.05) / 0.05, with white 1.05 / (L + 0.05).
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
