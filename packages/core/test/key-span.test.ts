import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  BoardGridFullError,
  coveredSlots,
  createKey,
  faderPositionToMultiplier,
  firstFreeSlotOnPage,
  InvalidBoardError,
  keySpanOf,
  makeBoard,
  moveKey,
  multiplierToFaderPosition,
  NoRoomForKeyError,
  parseAction,
  readStoredBoards,
  reflowBoard,
  setBoardGrid,
  setKey,
  SlotOccupiedError,
  type Board,
  type Key,
  type KeySpan,
} from "../src/index";
import { InMemoryBoardRepository } from "./fakes";

const volume = (slot: number, rows = 1, columns = 1, inputName = "Music"): Key =>
  rows === 1 && columns === 1
    ? { slot, action: { type: "obs.inputVolume", inputName } }
    : { slot, span: { rows, columns }, action: { type: "obs.inputVolume", inputName } };
const stream = (slot: number): Key => ({ slot, action: { type: "obs.toggleStream" } });
const deck = (keys: Key[], columns = 5, rows = 3): Board => makeBoard("d", "Deck", "deck", keys, { columns, rows });
const layout = (board: Board): [number, string, KeySpan][] =>
  board.keys.map((key) => [key.slot, key.action.type, keySpanOf(key)]);

describe("obs.inputVolume action", () => {
  it("names one OBS input, needs OBS and may span cells", () => {
    const definition = ACTION_REGISTRY["obs.inputVolume"];
    expect(definition).toMatchObject({ category: "obs", requiresObs: true, requiresDesktop: true, canSpan: true });
    expect(definition.params.map((param) => [param.name, param.kind])).toEqual([["inputName", "input"]]);
    expect(parseAction({ type: "obs.inputVolume", inputName: "Mic/Aux", extra: 1 })).toEqual({ type: "obs.inputVolume", inputName: "Mic/Aux" });
    expect(() => parseAction({ type: "obs.inputVolume", inputName: "" })).toThrow(InvalidBoardError);
    expect(ACTION_REGISTRY["obs.toggleMute"].canSpan).toBe(false);
  });
});

describe("key span", () => {
  it("accepts 1–3 rows and 1–2 columns on a volume key and drops a 1 × 1 span", () => {
    expect(createKey(volume(0, 3, 2)).span).toEqual({ rows: 3, columns: 2 });
    expect(createKey({ ...volume(0), span: { rows: 1, columns: 1 } })).not.toHaveProperty("span");
    expect(keySpanOf(volume(0))).toEqual({ rows: 1, columns: 1 });
    for (const span of [{ rows: 4, columns: 1 }, { rows: 1, columns: 3 }, { rows: 0, columns: 1 }, { rows: 1.5, columns: 1 }, "2x1", null]) {
      expect(() => createKey({ ...volume(0), span })).toThrow(InvalidBoardError);
    }
  });

  it("refuses a span on any other action", () => {
    expect(() => createKey({ ...stream(0), span: { rows: 2, columns: 1 } })).toThrow(InvalidBoardError);
    expect(createKey({ ...stream(0), span: { rows: 1, columns: 1 } })).toEqual(stream(0));
  });

  it("lists the cells a spanning key covers besides its own slot", () => {
    const board = deck([volume(1, 3, 2), stream(0)]);
    expect([...coveredSlots(board)].sort((a, b) => a - b)).toEqual([2, 6, 7, 11, 12]);
  });

  it("offers the first cell that is neither used nor covered for a new key", () => {
    expect(firstFreeSlotOnPage(deck([stream(0), volume(1, 3, 1)]), 0)).toBe(2);
    expect(firstFreeSlotOnPage(deck([volume(0, 3, 1), stream(1)]), 0)).toBe(2);
    expect(firstFreeSlotOnPage(deck([volume(0, 2, 1), stream(1), stream(2), stream(3), stream(4)]), 0)).toBe(6);
    const full = deck(Array.from({ length: 5 }, (_, column) => volume(column, 3, 1)));
    expect(firstFreeSlotOnPage(full, 0)).toBeNull();
    expect(firstFreeSlotOnPage(full, 1)).toBe(15);
  });
});

describe("setKey with spans", () => {
  const setup = (keys: Key[]) => new InMemoryBoardRepository([deck(keys)]);

  it("places a spanning key when every cell it covers is free", async () => {
    const repository = setup([stream(0)]);
    await setKey(repository, "d", volume(4, 3, 1));
    expect(layout((await repository.list())[0]!)).toEqual([
      [0, "obs.toggleStream", { rows: 1, columns: 1 }],
      [4, "obs.inputVolume", { rows: 3, columns: 1 }],
    ]);
  });

  it("refuses a key on a covered cell, or a block over another key or past the page edge", async () => {
    const repository = setup([volume(0, 3, 1), stream(7)]);
    await expect(setKey(repository, "d", stream(5))).rejects.toThrow(NoRoomForKeyError);
    await expect(setKey(repository, "d", stream(10), { replace: true })).rejects.toThrow(NoRoomForKeyError);
    await expect(setKey(repository, "d", volume(2, 2, 1))).rejects.toThrow(NoRoomForKeyError);
    // 4 is the last column: two columns cross the right edge; 10 is the last row: two rows cross the bottom.
    await expect(setKey(repository, "d", volume(4, 1, 2))).rejects.toThrow(NoRoomForKeyError);
    await expect(setKey(repository, "d", volume(13, 2, 1))).rejects.toThrow(NoRoomForKeyError);
    await expect(setKey(repository, "d", stream(0))).rejects.toThrow(SlotOccupiedError);
    expect((await repository.list())[0]!.keys).toHaveLength(2);
  });

  it("resizes a key in place when the new block has room, replacing only itself", async () => {
    const repository = setup([volume(1), stream(11)]);
    await setKey(repository, "d", volume(1, 2, 2), { replace: true });
    expect(keySpanOf((await repository.list())[0]!.keys[0]!)).toEqual({ rows: 2, columns: 2 });
    await expect(setKey(repository, "d", volume(1, 3, 1), { replace: true })).rejects.toThrow(NoRoomForKeyError);
  });
});

describe("moveKey with spans", () => {
  const setup = (keys: Key[]) => new InMemoryBoardRepository([deck(keys)]);

  it("moves a block to a place with room for all of it, even overlapping where it was", async () => {
    const repository = setup([volume(0, 3, 1), stream(3)]);
    expect(layout(await moveKey(repository, "d", 0, 1))).toEqual([
      [1, "obs.inputVolume", { rows: 3, columns: 1 }],
      [3, "obs.toggleStream", { rows: 1, columns: 1 }],
    ]);
  });

  it("swaps a block with a 1 × 1 key on its destination's first cell when the rest is free", async () => {
    const repository = setup([volume(0, 2, 1), stream(2)]);
    expect(layout(await moveKey(repository, "d", 0, 2))).toEqual([
      [0, "obs.toggleStream", { rows: 1, columns: 1 }],
      [2, "obs.inputVolume", { rows: 2, columns: 1 }],
    ]);
  });

  it("refuses a move without room for the whole block", async () => {
    const repository = setup([volume(0, 2, 1), stream(7), stream(3)]);
    // The rest of the block holds a key.
    await expect(moveKey(repository, "d", 0, 2)).rejects.toThrow(NoRoomForKeyError);
    // Past the bottom and the right edge of the page.
    await expect(moveKey(repository, "d", 0, 10)).rejects.toThrow(NoRoomForKeyError);
    // The key on the destination would land inside the moved block.
    const overlap = setup([volume(5, 2, 1), stream(0)]);
    await expect(moveKey(overlap, "d", 5, 0)).rejects.toThrow(NoRoomForKeyError);
  });

  it("refuses moving a 1 × 1 key onto a covered cell or onto a block", async () => {
    const repository = setup([volume(0, 3, 1), stream(1)]);
    await expect(moveKey(repository, "d", 1, 5)).rejects.toThrow(NoRoomForKeyError);
    await expect(moveKey(repository, "d", 1, 0)).rejects.toThrow(NoRoomForKeyError);
    expect(layout(await moveKey(repository, "d", 1, 2))).toEqual([
      [0, "obs.inputVolume", { rows: 3, columns: 1 }],
      [2, "obs.toggleStream", { rows: 1, columns: 1 }],
    ]);
  });
});

describe("grid reflow with spanning keys", () => {
  it("keeps a block where it is when it still fits", () => {
    const board = deck([volume(3, 3, 2), stream(0)]);
    expect(layout(reflowBoard(board, { columns: 6, rows: 4 }))).toEqual([
      [0, "obs.toggleStream", { rows: 1, columns: 1 }],
      [3, "obs.inputVolume", { rows: 3, columns: 2 }],
    ]);
  });

  it("moves a block that no longer fits to the first place in reading order with room for all of it", () => {
    // Columns 3–4 do not exist on a 3-column grid, and no 2 × 2 place on the first page is free.
    const board = deck([volume(3, 2, 2), stream(0), stream(6)]);
    expect(layout(reflowBoard(board, { columns: 3, rows: 3 }))).toEqual([
      [0, "obs.toggleStream", { rows: 1, columns: 1 }],
      [4, "obs.toggleStream", { rows: 1, columns: 1 }],
      [9, "obs.inputVolume", { rows: 2, columns: 2 }],
    ]);
  });

  it("shrinks a block taller than the grid", () => {
    const board = deck([volume(0, 3, 1)]);
    expect(layout(reflowBoard(board, { columns: 5, rows: 2 }))).toEqual([[0, "obs.inputVolume", { rows: 2, columns: 1 }]]);
  });

  it("refuses the change when a block finds no room", async () => {
    const keys = Array.from({ length: 100 }, (_, page) => [volume(page * 15 + 4, 3, 1), ...[0, 1, 2, 3].map((column) => volume(page * 15 + column, 3, 1))]).flat();
    const repository = new InMemoryBoardRepository([deck(keys)]);
    await expect(setBoardGrid(repository, { kind: "deck", columns: 4, rows: 3 })).rejects.toThrow(BoardGridFullError);
    expect(repository.writeCount).toBe(0);
  });
});

describe("stored spanning keys", () => {
  it("keeps a valid block and falls back to 1 × 1 for one that overlaps or crosses the page", () => {
    const stored = [
      {
        id: "d",
        name: "Deck",
        kind: "deck",
        columns: 5,
        rows: 3,
        keys: [volume(0, 3, 1), stream(5), volume(1, 2, 1), volume(4, 1, 2), volume(13, 2, 2)],
      },
    ];
    expect(layout(readStoredBoards(stored)[0]!)).toEqual([
      [0, "obs.inputVolume", { rows: 1, columns: 1 }],
      [1, "obs.inputVolume", { rows: 2, columns: 1 }],
      [4, "obs.inputVolume", { rows: 1, columns: 1 }],
      [5, "obs.toggleStream", { rows: 1, columns: 1 }],
      [13, "obs.inputVolume", { rows: 1, columns: 1 }],
    ]);
  });

  it("drops a stored span on an action that cannot have one", () => {
    const stored = [{ id: "d", name: "Deck", kind: "deck", keys: [{ ...stream(0), span: { rows: 2, columns: 1 } }, stream(1)] }];
    expect(readStoredBoards(stored)[0]!.keys).toEqual([stream(1)]);
  });
});

describe("OBS mixer fader curve", () => {
  it("maps the ends and matches the OBS log fader (0 dB at the top, −96 dB at the bottom)", () => {
    expect(faderPositionToMultiplier(1)).toBe(1);
    expect(faderPositionToMultiplier(0)).toBe(0);
    // Halfway is 6 − 102 · 17^−0.5 ≈ −18.74 dB.
    expect(20 * Math.log10(faderPositionToMultiplier(0.5))).toBeCloseTo(-18.739, 2);
    expect(multiplierToFaderPosition(0)).toBe(0);
    expect(multiplierToFaderPosition(1)).toBe(1);
    expect(multiplierToFaderPosition(2)).toBe(1);
    expect(multiplierToFaderPosition(10 ** (-100 / 20))).toBe(0);
  });

  it("round-trips any position", () => {
    for (const position of [0.01, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      expect(multiplierToFaderPosition(faderPositionToMultiplier(position))).toBeCloseTo(position, 6);
    }
  });
});
