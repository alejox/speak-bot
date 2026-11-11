import { describe, expect, it } from "vitest";
import {
  boardPageCount,
  BoardGridFullError,
  buildDefaultBoard,
  createBoard,
  DEFAULT_BOARD_GRID,
  InvalidBoardError,
  isValidKeySlot,
  keysOnPage,
  makeBoard,
  MAX_BOARD_PAGES,
  MAX_KEY_SLOTS,
  moveCaptionKeysToVoice,
  navigateBoard,
  parseBoardGrid,
  readStoredBoards,
  reflowBoard,
  restoreDefaultBoard,
  setBoardGrid,
  type Board,
  type Key,
} from "../src/index";
import { InMemoryBoardRepository, sequentialIds } from "./fakes";

const key = (slot: number): Key => ({ slot, action: { type: "voice.speak", text: `Key ${slot}` } });
const board = (id: string, slots: number[], columns = 5, rows = 3): Board => makeBoard(id, id, "voice", slots.map(key), { columns, rows });
const slotsOf = (target: Board): number[] => target.keys.map((entry) => entry.slot);
const textOf = (target: Board): string[] => target.keys.map((entry) => (entry.action.type === "voice.speak" ? entry.action.text : ""));

describe("board grid", () => {
  it("defaults to 5 × 3 and accepts 3–8 columns and 2–5 rows", () => {
    expect(DEFAULT_BOARD_GRID).toEqual({ columns: 5, rows: 3 });
    expect(makeBoard("a", "A", "voice")).toMatchObject({ columns: 5, rows: 3 });
    expect(parseBoardGrid({ columns: 8, rows: 5 })).toEqual({ columns: 8, rows: 5 });
    expect(parseBoardGrid({ columns: 3, rows: 2 })).toEqual({ columns: 3, rows: 2 });
    for (const bad of [{ columns: 2, rows: 3 }, { columns: 9, rows: 3 }, { columns: 5, rows: 1 }, { columns: 5, rows: 6 }, { columns: 5.5, rows: 3 }, null, "5x3"]) {
      expect(() => parseBoardGrid(bad)).toThrow(InvalidBoardError);
    }
  });

  it("bounds key slots by the largest grid, so no slot depends on the current size", () => {
    expect(MAX_KEY_SLOTS).toBe(8 * 5 * MAX_BOARD_PAGES);
    expect(isValidKeySlot(MAX_KEY_SLOTS - 1)).toBe(true);
    expect(isValidKeySlot(MAX_KEY_SLOTS)).toBe(false);
  });

  it("reads the stored size back, falling back to 5 × 3 when it is invalid", () => {
    const stored = [{ id: "a", name: "A", kind: "voice", columns: 6, rows: 4, keys: [key(20)] }];
    expect(readStoredBoards(stored)[0]).toMatchObject({ columns: 6, rows: 4, keys: [key(20)] });
    expect(readStoredBoards([{ id: "a", name: "A", kind: "voice", columns: 12, rows: 4, keys: [] }])[0]).toMatchObject({ columns: 5, rows: 3 });
    expect(readStoredBoards([{ id: "a", name: "A", kind: "voice", keys: [] }])[0]).toMatchObject({ columns: 5, rows: 3 });
  });

  it("gives every stored board the first board's size", () => {
    const stored = [
      { id: "a", name: "A", kind: "voice", columns: 6, rows: 4, keys: [] },
      { id: "b", name: "B", kind: "deck", columns: 3, rows: 2, keys: [] },
      // Split in two: both halves take the shared size.
      { id: "c", name: "C", columns: 7, rows: 5, keys: [key(0), { slot: 1, action: { type: "obs.toggleStream" } }] },
    ];
    expect(readStoredBoards(stored).map(({ id, columns, rows }) => ({ id, columns, rows }))).toEqual([
      { id: "a", columns: 6, rows: 4 },
      { id: "b", columns: 6, rows: 4 },
      { id: "c", columns: 6, rows: 4 },
      { id: "c-deck", columns: 6, rows: 4 },
    ]);
  });
});

describe("pages follow the board's grid", () => {
  it("counts, lists and navigates pages of columns × rows keys", () => {
    const wide = board("w", [0, 23, 24], 6, 4);
    expect(boardPageCount(wide)).toBe(2);
    expect(keysOnPage(wide, 0)).toHaveLength(24);
    expect(keysOnPage(wide, 1)[0]?.slot).toBe(24);
    expect(navigateBoard([wide], { boardId: "w", page: 1 }, { type: "nav.nextPage" })).toEqual({ boardId: "w", page: 0 });
    const small = board("s", [6], 3, 2);
    expect(boardPageCount(small)).toBe(2);
    expect(keysOnPage(small, 1)).toHaveLength(6);
  });
});

describe("reflowBoard", () => {
  it("keeps every key's page, row and column when growing", () => {
    // 5 × 3: slot 7 is page 0 row 1 column 2; slot 19 is page 1 row 0 column 4.
    const grown = reflowBoard(board("a", [0, 7, 14, 19]), { columns: 6, rows: 4 });
    expect(grown).toMatchObject({ columns: 6, rows: 4 });
    expect(slotsOf(grown)).toEqual([0, 6 + 2, 2 * 6 + 4, 24 + 4]);
    expect(textOf(grown)).toEqual(["Key 0", "Key 7", "Key 14", "Key 19"]);
  });

  it("moves keys that no longer fit to the first free slot in reading order from their own page", () => {
    // 5 × 3 → 4 × 2. Page 0 keeps 0,1 (row 0) and 5,6 (row 1); 4 and 10 overflow.
    const shrunk = reflowBoard(board("a", [0, 1, 4, 5, 6, 10]), { columns: 4, rows: 2 });
    expect(shrunk).toMatchObject({ columns: 4, rows: 2 });
    // Fitting: 0→0, 1→1, 5→4, 6→5. Overflow in reading order: 4→2, 10→3.
    expect(shrunk.keys.map((entry) => [textOf({ ...shrunk, keys: [entry] })[0], entry.slot])).toEqual([
      ["Key 0", 0],
      ["Key 1", 1],
      ["Key 4", 2],
      ["Key 10", 3],
      ["Key 5", 4],
      ["Key 6", 5],
    ]);
  });

  it("opens new pages for overflow and never moves a key to an earlier page", () => {
    const full = Array.from({ length: 15 }, (_, slot) => slot);
    const shrunk = reflowBoard(board("a", [...full, 15]), { columns: 3, rows: 2 });
    expect(shrunk.keys).toHaveLength(16);
    // Key 15 was on page 1 row 0 column 0: it fits there (slot 6), so the first page's overflow goes around it.
    expect(shrunk.keys.find((entry) => entry.action.type === "voice.speak" && entry.action.text === "Key 15")?.slot).toBe(6);
    expect(Math.max(...slotsOf(shrunk))).toBe(15);
  });

  it("refuses when there is no room for every key", () => {
    const crowded = board("a", Array.from({ length: MAX_BOARD_PAGES * 15 }, (_, slot) => slot));
    expect(() => reflowBoard(crowded, { columns: 3, rows: 2 })).toThrow(BoardGridFullError);
  });
});

describe("setBoardGrid", () => {
  it("resizes every board in one write and returns them", async () => {
    const repository = new InMemoryBoardRepository([board("a", [4]), makeBoard("d", "D", "deck", [{ slot: 0, action: { type: "obs.toggleStream" } }])]);
    const boards = await setBoardGrid(repository, { columns: 4, rows: 2 });
    expect(repository.writeCount).toBe(1);
    expect(boards.map(({ columns, rows }) => ({ columns, rows }))).toEqual([
      { columns: 4, rows: 2 },
      { columns: 4, rows: 2 },
    ]);
    expect(slotsOf(boards[0]!)).toEqual([0]);
    expect(await repository.list()).toEqual(boards);
  });

  it("writes nothing when a board has no room or the size is invalid", async () => {
    const crowded = board("a", Array.from({ length: MAX_BOARD_PAGES * 15 }, (_, slot) => slot));
    const repository = new InMemoryBoardRepository([board("b", [0]), crowded]);
    await expect(setBoardGrid(repository, { columns: 3, rows: 2 })).rejects.toThrow(BoardGridFullError);
    await expect(setBoardGrid(repository, { columns: 9, rows: 2 })).rejects.toThrow(InvalidBoardError);
    expect(repository.writeCount).toBe(0);
  });

  it("writes nothing when the size does not change", async () => {
    const repository = new InMemoryBoardRepository([board("a", [0])]);
    await setBoardGrid(repository, { columns: 5, rows: 3 });
    expect(repository.writeCount).toBe(0);
  });
});

describe("new boards take the current size", () => {
  it("creates and restores boards with the shared grid", async () => {
    const repository = new InMemoryBoardRepository([board("a", [], 6, 4)]);
    const created = await createBoard({ repository, generateId: sequentialIds("b") }, { name: "New", kind: "deck" });
    expect(created).toMatchObject({ columns: 6, rows: 4 });
    const restored = await restoreDefaultBoard(repository, "en");
    expect(restored).toMatchObject({ columns: 6, rows: 4 });
  });

  it("puts the communication keys on the last slots of a page of the board's grid", () => {
    const wide = buildDefaultBoard("en", { columns: 6, rows: 4 });
    const commands = wide.keys.filter((entry) => entry.action.type !== "voice.speak").map((entry) => entry.slot);
    expect(commands).toEqual([19, 20, 21, 22, 23]);
    const narrow = buildDefaultBoard("en", { columns: 4, rows: 3 });
    const narrowCommands = narrow.keys.filter((entry) => entry.action.type !== "voice.speak").map((entry) => entry.slot);
    expect(narrowCommands.every((slot) => slot % 12 >= 7)).toBe(true);
  });

  it("seeds moved caption keys on the last slots of the voice board's page", () => {
    const voice = board("communication", [], 6, 4);
    const deck = makeBoard("deck", "Deck", "deck", [], { columns: 6, rows: 4 });
    const withCaptions: Board = { ...deck, keys: [{ slot: 30, action: { type: "captions.clear" } }] };
    const { report } = moveCaptionKeysToVoice([voice, withCaptions], "en");
    // Its own slot is off the first page, so it takes the default board's clear slot: 24 - 5 + 2.
    expect(report.moved.map((move) => move.toSlot)).toEqual([21]);
  });
});
