import { describe, expect, it } from "vitest";
import {
  buildDefaultBoard,
  DEFAULT_BOARD_ID,
  InvalidBoardError,
  isActionAllowedOnBoard,
  KEYS_PER_PAGE,
  makeBoard,
  MAX_BOARD_PAGES,
  moveCaptionKeysToVoice,
  moveCaptionKeysToVoiceBoards,
  readStoredBoards,
  setKey,
  type Action,
  type Board,
  type BoardKind,
  type Key,
} from "../src/index";
import { InMemoryBoardRepository } from "./fakes";

const speak = (text: string): Action => ({ type: "voice.speak", text });
const stream: Action = { type: "obs.toggleStream" };
const clear: Action = { type: "captions.clear" };
const toggle: Action = { type: "captions.toggle" };
const board = (id: string, kind: BoardKind, keys: Key[] = [], name = id): Board => ({ id, name, kind, columns: 5, rows: 3, keys });
/** A voice board with speak keys on `slots`. */
const voiceWith = (id: string, slots: number[]): Board =>
  board(id, "voice", slots.map((slot) => ({ slot, action: speak(`p${slot}`) })));
/** The old default deck: stream, record, then the two caption keys. */
const oldDeck = (): Board =>
  board("deck", "deck", [
    { slot: 0, action: stream },
    { slot: 1, action: { type: "obs.toggleRecord" } },
    { slot: 2, label: "Borrar", icon: "eraser", color: "#112233", action: clear },
    { slot: 3, action: toggle },
  ]);

describe("deck boards no longer accept caption keys", () => {
  it("rejects captions on deck boards in validation and editing", async () => {
    expect(isActionAllowedOnBoard("deck", "captions.clear")).toBe(false);
    expect(isActionAllowedOnBoard("deck", "captions.toggle")).toBe(false);
    expect(() => makeBoard("d", "D", "deck", [{ slot: 0, action: clear }])).toThrow(InvalidBoardError);
    const repository = new InMemoryBoardRepository([board("d", "deck")]);
    await expect(setKey(repository, "d", { slot: 0, action: toggle })).rejects.toThrow(InvalidBoardError);
  });

  it("still loads caption keys stored on a deck board, unchanged, so loading never fails before the migration", () => {
    const stored = [oldDeck()];
    expect(readStoredBoards(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });
});

describe("moveCaptionKeysToVoice", () => {
  it("moves the caption keys of a deck board to the communication board, keeping how they look", () => {
    const voice = { ...voiceWith(DEFAULT_BOARD_ID, [0, 1, 2, 3, 4, 5]), name: "Comunicación" };
    const { boards, report } = moveCaptionKeysToVoice([voice, oldDeck()], "es");
    expect(boards[1]!.keys.map((key) => key.action.type)).toEqual(["obs.toggleStream", "obs.toggleRecord"]);
    // Their slots 2 and 3 are taken on the voice board, so they go to 12 and 13 (the seed's columns).
    expect(boards[0]!.keys.filter((key) => key.action.type.startsWith("captions."))).toEqual([
      { slot: 12, label: "Borrar", icon: "eraser", color: "#112233", action: clear },
      { slot: 13, action: toggle },
    ]);
    expect(report).toEqual({
      changed: true,
      moved: [
        { fromBoardId: "deck", fromSlot: 2, toBoardId: DEFAULT_BOARD_ID, toSlot: 12, actionType: "captions.clear" },
        { fromBoardId: "deck", fromSlot: 3, toBoardId: DEFAULT_BOARD_ID, toSlot: 13, actionType: "captions.toggle" },
      ],
      dropped: [],
      kept: [],
      createdBoardId: null,
    });
  });

  it("keeps a key's original slot when it is free on the first page", () => {
    const { boards } = moveCaptionKeysToVoice([voiceWith(DEFAULT_BOARD_ID, [0, 1]), oldDeck()], "en");
    expect(boards[0]!.keys.filter((key) => key.action.type.startsWith("captions.")).map((key) => key.slot)).toEqual([2, 3]);
  });

  it("prefers the communication board over other voice boards, then the first voice board", () => {
    const other = voiceWith("other", []);
    const first = moveCaptionKeysToVoice([other, voiceWith(DEFAULT_BOARD_ID, []), oldDeck()], "en");
    expect(first.report.moved.every((move) => move.toBoardId === DEFAULT_BOARD_ID)).toBe(true);
    const second = moveCaptionKeysToVoice([oldDeck(), other, voiceWith("another", [])], "en");
    expect(second.report.moved.every((move) => move.toBoardId === "other")).toBe(true);
  });

  it("drops a caption key from the deck when the voice board already has one of the same action", () => {
    const voice = buildDefaultBoard("es");
    const { boards, report } = moveCaptionKeysToVoice([voice, oldDeck()], "es");
    expect(boards[0]).toEqual(voice);
    expect(boards[1]!.keys.map((key) => key.slot)).toEqual([0, 1]);
    expect(report.moved).toEqual([]);
    expect(report.dropped).toEqual([
      { fromBoardId: "deck", fromSlot: 2, toBoardId: DEFAULT_BOARD_ID, actionType: "captions.clear" },
      { fromBoardId: "deck", fromSlot: 3, toBoardId: DEFAULT_BOARD_ID, actionType: "captions.toggle" },
    ]);
  });

  it("creates the default communication board (with its caption keys) when there is no voice board", () => {
    const { boards, report } = moveCaptionKeysToVoice([oldDeck()], "es");
    expect(boards).toEqual([buildDefaultBoard("es"), board("deck", "deck", oldDeck().keys.slice(0, 2))]);
    expect(report.createdBoardId).toBe(DEFAULT_BOARD_ID);
    expect(report.dropped.map((drop) => drop.actionType)).toEqual(["captions.clear", "captions.toggle"]);
  });

  it("puts a key on the next free slot, then on a new page, when the first page is full", () => {
    const fullFirstPage = voiceWith(DEFAULT_BOARD_ID, Array.from({ length: KEYS_PER_PAGE }, (_, slot) => slot));
    const nextFree = moveCaptionKeysToVoice([{ ...fullFirstPage, keys: [...fullFirstPage.keys, { slot: 15, action: speak("x") }] }, oldDeck()], "en");
    // Only the first page exists (plus slot 15 on page 2), so free slots on page 2 come first.
    expect(nextFree.report.moved.map((move) => move.toSlot)).toEqual([16, 17]);
    const newPage = moveCaptionKeysToVoice([fullFirstPage, oldDeck()], "en");
    expect(newPage.report.moved.map((move) => move.toSlot)).toEqual([KEYS_PER_PAGE, KEYS_PER_PAGE + 1]);
  });

  it("keeps a key on the deck board when the voice board has no room at all", () => {
    const allSlots = Array.from({ length: KEYS_PER_PAGE * MAX_BOARD_PAGES }, (_, slot) => slot);
    const full = voiceWith(DEFAULT_BOARD_ID, allSlots);
    const { boards, report } = moveCaptionKeysToVoice([full, oldDeck()], "en");
    expect(boards[1]).toEqual(oldDeck());
    expect(report.kept.map((kept) => kept.fromSlot)).toEqual([2, 3]);
    expect(report.changed).toBe(false);
  });

  it("changes nothing when no deck board holds caption keys, and a second run is a no-op", () => {
    const boards = [voiceWith(DEFAULT_BOARD_ID, [0]), oldDeck()];
    const once = moveCaptionKeysToVoice(boards, "en");
    const twice = moveCaptionKeysToVoice(once.boards, "en");
    expect(twice.boards).toEqual(once.boards);
    expect(twice.report).toEqual({ changed: false, moved: [], dropped: [], kept: [], createdBoardId: null });
  });
});

describe("moveCaptionKeysToVoiceBoards", () => {
  it("stores the migrated boards once and does not write again", async () => {
    const repository = new InMemoryBoardRepository([voiceWith(DEFAULT_BOARD_ID, [0]), oldDeck()]);
    const report = await moveCaptionKeysToVoiceBoards({ repository }, { language: "en" });
    expect(report.moved).toHaveLength(2);
    expect(repository.writeCount).toBe(1);
    const second = await moveCaptionKeysToVoiceBoards({ repository }, { language: "en" });
    expect(second.changed).toBe(false);
    expect(repository.writeCount).toBe(1);
    const [, deck] = await repository.list();
    expect(deck!.keys.every((key) => !key.action.type.startsWith("captions."))).toBe(true);
  });
});
