import { describe, expect, it } from "vitest";
import {
  BOARD_GRID_RANGES,
  createBoard,
  DEFAULT_DECK_BOARD_ID,
  gridOfBoards,
  InvalidBoardError,
  isValidKeySlot,
  makeBoard,
  MAX_BOARD_PAGES,
  MAX_KEY_SLOTS,
  moveCaptionKeysToVoice,
  parseBoardGrid,
  readStoredBoards,
  restoreDefaultBoard,
  setBoardGrid,
  type Board,
  type Key,
} from "../src/index";
import { InMemoryBoardRepository, sequentialIds } from "./fakes";

const speak = (slot: number): Key => ({ slot, action: { type: "voice.speak", text: `Key ${slot}` } });
const stream = (slot: number): Key => ({ slot, action: { type: "obs.toggleStream" } });
const voice = (id: string, columns = 5, rows = 3, keys: Key[] = [speak(0)]): Board => makeBoard(id, id, "voice", keys, { columns, rows });
const deck = (id: string, columns = 5, rows = 3, keys: Key[] = [stream(0)]): Board => makeBoard(id, id, "deck", keys, { columns, rows });
const sizes = (boards: readonly Board[]) => boards.map(({ id, columns, rows }) => [id, columns, rows]);

describe("grid size ranges per kind", () => {
  it("lets Deck boards have 3–8 columns and 2–5 rows, and Voice boards 3–10 columns and 2–8 rows", () => {
    expect(BOARD_GRID_RANGES).toEqual({
      deck: { minColumns: 3, maxColumns: 8, minRows: 2, maxRows: 5 },
      voice: { minColumns: 3, maxColumns: 10, minRows: 2, maxRows: 8 },
    });
    expect(parseBoardGrid({ columns: 10, rows: 8 }, "voice")).toEqual({ columns: 10, rows: 8 });
    expect(() => parseBoardGrid({ columns: 10, rows: 8 }, "deck")).toThrow(InvalidBoardError);
    expect(() => parseBoardGrid({ columns: 11, rows: 8 }, "voice")).toThrow(InvalidBoardError);
    expect(() => parseBoardGrid({ columns: 8, rows: 9 }, "voice")).toThrow(InvalidBoardError);
    expect(makeBoard("v", "V", "voice", [], { columns: 10, rows: 8 })).toMatchObject({ columns: 10, rows: 8 });
    expect(() => makeBoard("d", "D", "deck", [], { columns: 9, rows: 5 })).toThrow(InvalidBoardError);
  });

  it("bounds key slots by the largest page of any kind", () => {
    expect(MAX_KEY_SLOTS).toBe(10 * 8 * MAX_BOARD_PAGES);
    expect(isValidKeySlot(7999)).toBe(true);
    expect(isValidKeySlot(8000)).toBe(false);
  });
});

describe("one grid size per kind", () => {
  it("takes each kind's size from its first board, 5 × 3 when there is none", () => {
    const boards = [voice("v", 10, 8), deck("d", 6, 4)];
    expect(gridOfBoards(boards, "voice")).toEqual({ columns: 10, rows: 8 });
    expect(gridOfBoards(boards, "deck")).toEqual({ columns: 6, rows: 4 });
    expect(gridOfBoards([voice("v", 7, 6)], "deck")).toEqual({ columns: 5, rows: 3 });
  });

  it("resizes only the boards of one kind, in one write", async () => {
    const repository = new InMemoryBoardRepository([voice("v1"), deck("d1"), voice("v2")]);
    const boards = await setBoardGrid(repository, { kind: "voice", columns: 10, rows: 8 });
    expect(repository.writeCount).toBe(1);
    expect(sizes(boards)).toEqual([
      ["v1", 10, 8],
      ["d1", 5, 3],
      ["v2", 10, 8],
    ]);
    const decks = await setBoardGrid(repository, { kind: "deck", columns: 3, rows: 2 });
    expect(sizes(decks)).toEqual([
      ["v1", 10, 8],
      ["d1", 3, 2],
      ["v2", 10, 8],
    ]);
  });

  it("refuses a size outside the kind's range or without a kind, writing nothing", async () => {
    const repository = new InMemoryBoardRepository([voice("v1"), deck("d1")]);
    await expect(setBoardGrid(repository, { kind: "deck", columns: 10, rows: 8 })).rejects.toThrow(InvalidBoardError);
    await expect(setBoardGrid(repository, { columns: 6, rows: 4 })).rejects.toThrow(InvalidBoardError);
    expect(repository.writeCount).toBe(0);
  });

  it("gives new and restored boards the size of their kind", async () => {
    const repository = new InMemoryBoardRepository([voice("v1", 8, 6), deck("d1", 6, 4)]);
    const ids = sequentialIds("b");
    expect(await createBoard({ repository, generateId: ids }, { name: "Talk", kind: "voice" })).toMatchObject({ columns: 8, rows: 6 });
    expect(await createBoard({ repository, generateId: ids }, { name: "Scenes", kind: "deck" })).toMatchObject({ columns: 6, rows: 4 });
    expect(await restoreDefaultBoard(repository, "en")).toMatchObject({ columns: 8, rows: 6 });
    expect(await restoreDefaultBoard(repository, "en", DEFAULT_DECK_BOARD_ID)).toMatchObject({ columns: 6, rows: 4 });
  });

  it("normalizes stored sizes per kind to the first board of that kind, checked against its kind's range", () => {
    const stored = [
      { id: "d1", name: "D1", kind: "deck", columns: 6, rows: 4, keys: [] },
      { id: "v1", name: "V1", kind: "voice", columns: 10, rows: 8, keys: [] },
      { id: "v2", name: "V2", kind: "voice", columns: 4, rows: 2, keys: [] },
      { id: "d2", name: "D2", kind: "deck", columns: 3, rows: 2, keys: [] },
    ];
    expect(sizes(readStoredBoards(stored))).toEqual([
      ["d1", 6, 4],
      ["v1", 10, 8],
      ["v2", 10, 8],
      ["d2", 6, 4],
    ]);
    // 10 × 8 is too large for a deck board: the default size.
    expect(sizes(readStoredBoards([{ id: "d", name: "D", kind: "deck", columns: 10, rows: 8, keys: [] }]))).toEqual([["d", 5, 3]]);
  });

  it("keeps a stored key on the largest voice page", () => {
    const stored = [{ id: "v", name: "V", kind: "voice", columns: 10, rows: 8, keys: [speak(7999)] }];
    expect(readStoredBoards(stored)[0]!.keys.map((key) => key.slot)).toEqual([7999]);
  });

  it("gives a board split off a stored board the size of its own kind", () => {
    const stored = [
      { id: "v", name: "V", kind: "voice", columns: 10, rows: 8, keys: [] },
      { id: "x", name: "X", kind: "voice", columns: 10, rows: 8, keys: [speak(0), stream(1)] },
    ];
    expect(sizes(readStoredBoards(stored))).toEqual([
      ["v", 10, 8],
      ["x", 10, 8],
      ["x-deck", 5, 3],
    ]);
  });

  it("seeds a voice board for moved caption keys with the voice size", () => {
    const captions: Key = { slot: 0, action: { type: "captions.clear" } };
    const boards = [{ ...deck("d1", 6, 4, [stream(1)]), keys: [captions, stream(1)] }];
    const { boards: next } = moveCaptionKeysToVoice(boards, "en");
    const seeded = next.find((board) => board.kind === "voice")!;
    expect(seeded).toMatchObject({ columns: 5, rows: 3 });
  });
});
