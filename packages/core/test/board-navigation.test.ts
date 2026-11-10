import { describe, expect, it } from "vitest";
import {
  boardPageCount,
  createBoard,
  BoardLimitError,
  contrastTextColor,
  KEYS_PER_PAGE,
  keysOnPage,
  makeBoard,
  MAX_BOARDS,
  navigateBoard,
  resolveBoardPosition,
  type Board,
  type Key,
} from "../src/index";
import { InMemoryBoardRepository, sequentialIds } from "./fakes";

const key = (slot: number): Key => ({ slot, action: { type: "voice.speak", text: `Key ${slot}` } });
const board = (id: string, slots: number[] = []): Board => makeBoard(id, id.toUpperCase(), "voice", slots.map(key));

describe("board pages", () => {
  it("has one page when empty and enough pages for its highest key", () => {
    expect(boardPageCount(board("a"))).toBe(1);
    expect(boardPageCount(board("a", [0, 14]))).toBe(1);
    expect(boardPageCount(board("a", [15]))).toBe(2);
    expect(boardPageCount(board("a", [3, 2 * KEYS_PER_PAGE + 1]))).toBe(3);
  });

  it("lists the keys of one page by position, leaving holes for empty slots", () => {
    const keys = keysOnPage(board("a", [0, 2, 16]), 1);
    expect(keys).toHaveLength(KEYS_PER_PAGE);
    expect(keys[1]?.slot).toBe(16);
    expect(keys.filter(Boolean)).toHaveLength(1);
    expect(keysOnPage(board("a", [0, 2]), 0).map((entry) => entry?.slot ?? null).slice(0, 3)).toEqual([0, null, 2]);
  });
});

describe("resolveBoardPosition", () => {
  const boards = [board("a", [0]), board("b", [0, 20])];

  it("keeps a valid position", () => {
    expect(resolveBoardPosition(boards, { boardId: "b", page: 1 })).toEqual({ boardId: "b", page: 1 });
  });

  it("falls back to the first board when the saved one is gone, and clamps the page", () => {
    expect(resolveBoardPosition(boards, { boardId: "gone", page: 4 })).toEqual({ boardId: "a", page: 0 });
    expect(resolveBoardPosition(boards, null)).toEqual({ boardId: "a", page: 0 });
    expect(resolveBoardPosition(boards, { boardId: "b", page: 9 })).toEqual({ boardId: "b", page: 1 });
    expect(resolveBoardPosition(boards, { boardId: "b", page: -2 })).toEqual({ boardId: "b", page: 0 });
  });

  it("is null without boards", () => {
    expect(resolveBoardPosition([], { boardId: "a", page: 0 })).toBeNull();
  });
});

describe("navigateBoard", () => {
  const boards = [board("a", [0, 15, 30]), board("b", [0])];
  const at = (boardId: string, page: number) => ({ boardId, page });

  it("goes to the next and previous page, wrapping around", () => {
    expect(navigateBoard(boards, at("a", 0), { type: "nav.nextPage" })).toEqual(at("a", 1));
    expect(navigateBoard(boards, at("a", 2), { type: "nav.nextPage" })).toEqual(at("a", 0));
    expect(navigateBoard(boards, at("a", 0), { type: "nav.prevPage" })).toEqual(at("a", 2));
    expect(navigateBoard(boards, at("b", 0), { type: "nav.nextPage" })).toEqual(at("b", 0));
  });

  it("goes to a 1-based page, staying on the last page when it does not exist", () => {
    expect(navigateBoard(boards, at("a", 0), { type: "nav.goToPage", page: 2 })).toEqual(at("a", 1));
    expect(navigateBoard(boards, at("a", 0), { type: "nav.goToPage", page: 50 })).toEqual(at("a", 2));
  });

  it("opens another board on its first page and ignores a board that no longer exists", () => {
    expect(navigateBoard(boards, at("a", 2), { type: "nav.goToBoard", boardId: "b" })).toEqual(at("b", 0));
    expect(navigateBoard(boards, at("a", 2), { type: "nav.goToBoard", boardId: "gone" })).toEqual(at("a", 2));
  });
});

describe("contrastTextColor", () => {
  it("picks black text on light keys and white text on dark keys", () => {
    expect(contrastTextColor("#ffffff")).toBe("#000000");
    expect(contrastTextColor("#facc15")).toBe("#000000");
    expect(contrastTextColor("#000000")).toBe("#ffffff");
    expect(contrastTextColor("#1d4ed8")).toBe("#ffffff");
  });

  it("falls back to white text for invalid colors", () => {
    expect(contrastTextColor("blue")).toBe("#ffffff");
  });
});

describe("createBoard at the limit", () => {
  it("rejects with BoardLimitError, so clients can explain it", async () => {
    const repository = new InMemoryBoardRepository(Array.from({ length: MAX_BOARDS }, (_, index) => board(`b${index}`)));
    await expect(createBoard({ repository, generateId: sequentialIds() }, { name: "One more", kind: "voice" })).rejects.toThrow(BoardLimitError);
  });
});
