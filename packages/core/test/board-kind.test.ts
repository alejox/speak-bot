import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  ACTION_TYPES,
  allowedActionCategories,
  BOARD_KINDS,
  buildDefaultBoard,
  buildDefaultBoards,
  buildDefaultDeckBoard,
  createBoard,
  DEFAULT_BOARD_ID,
  DEFAULT_DECK_BOARD_ID,
  initializeBoards,
  InvalidBoardError,
  isActionAllowedOnBoard,
  listBoards,
  makeBoard,
  MAX_BOARD_NAME_LENGTH,
  MAX_BOARDS,
  readStoredBoards,
  restoreDefaultBoard,
  setKey,
  type Action,
  type Board,
  type BoardKind,
  type Key,
} from "../src/index";
import { InMemoryBoardRepository, sequentialIds } from "./fakes";

const speak = (text: string): Action => ({ type: "voice.speak", text });
const scene = (sceneName: string): Action => ({ type: "obs.switchScene", sceneName });
const board = (id: string, kind: BoardKind, keys: Key[] = [], name = id): Board => ({ id, name, kind, columns: 5, rows: 3, keys });
/** A board as versions before board kinds stored it. */
const legacy = (id: string, keys: Key[] = [], name = id) => ({ id, name, columns: 5, rows: 3, keys });

describe("board kinds", () => {
  it("lists the two kinds and the action categories each one allows", () => {
    expect(BOARD_KINDS).toEqual(["voice", "deck"]);
    expect(allowedActionCategories("voice")).toEqual(["voice", "captions", "navigation"]);
    expect(allowedActionCategories("deck")).toEqual(["navigation", "obs", "system"]);
  });

  it("allows every action only on the kinds that list its category", () => {
    for (const type of ACTION_TYPES) {
      const { category } = ACTION_REGISTRY[type];
      expect(isActionAllowedOnBoard("voice", type)).toBe(category !== "obs" && category !== "system");
      // Captions belong to Voice; caption keys stored on deck boards are moved by moveCaptionKeysToVoice.
      expect(isActionAllowedOnBoard("deck", type)).toBe(category === "navigation" || category === "obs" || category === "system");
    }
  });

  it("makes a board of a kind and rejects keys the kind does not allow", () => {
    expect(makeBoard("a", "A", "deck", [{ slot: 1, action: scene("Main") }])).toEqual(board("a", "deck", [{ slot: 1, action: scene("Main") }], "A"));
    expect(() => makeBoard("a", "A", "voice", [{ slot: 1, action: scene("Main") }])).toThrow(InvalidBoardError);
    expect(() => makeBoard("a", "A", "deck", [{ slot: 1, action: speak("Hi") }])).toThrow(InvalidBoardError);
    expect(() => makeBoard("a", "A", "radio" as BoardKind)).toThrow(InvalidBoardError);
  });
});

describe("board kind in the use cases", () => {
  const setup = (boards: Board[]) => {
    const repository = new InMemoryBoardRepository(boards);
    return { repository, deps: { repository, generateId: sequentialIds("board") } };
  };

  it("creates a board of the requested kind and rejects an unknown or missing kind", async () => {
    const { deps } = setup([board("v", "voice")]);
    expect(await createBoard(deps, { name: "Stream", kind: "deck" })).toEqual(board("board-1", "deck", [], "Stream"));
    expect((await createBoard(deps, { name: "Talk", kind: "voice" })).kind).toBe("voice");
    await expect(createBoard(deps, { name: "Bad", kind: "radio" })).rejects.toThrow(InvalidBoardError);
    await expect(createBoard(deps, { name: "Bad", kind: undefined })).rejects.toThrow(InvalidBoardError);
  });

  it("only sets keys whose action the board kind allows, and writes nothing otherwise", async () => {
    const { repository } = setup([board("v", "voice"), board("d", "deck")]);
    await expect(setKey(repository, "v", { slot: 0, action: scene("Main") })).rejects.toThrow(InvalidBoardError);
    await expect(setKey(repository, "d", { slot: 0, action: speak("Hi") })).rejects.toThrow(InvalidBoardError);
    expect(repository.writeCount).toBe(0);

    await setKey(repository, "v", { slot: 0, action: speak("Hi") });
    await setKey(repository, "v", { slot: 1, action: { type: "nav.nextPage" } });
    await setKey(repository, "v", { slot: 2, action: { type: "captions.clear" } });
    await setKey(repository, "d", { slot: 0, action: scene("Main") });
    await expect(setKey(repository, "d", { slot: 1, action: { type: "captions.toggle" } })).rejects.toThrow(InvalidBoardError);
    await setKey(repository, "d", { slot: 2, action: { type: "nav.goToBoard", boardId: "v" } });
    expect((await listBoards(repository)).map((b) => b.keys.length)).toEqual([3, 2]);
  });
});

describe("stored boards without a kind", () => {
  it("become voice boards when they hold only voice and navigation keys, or no keys", () => {
    const stored = [legacy("empty"), legacy("talk", [{ slot: 3, action: speak("Hi") }, { slot: 9, action: { type: "nav.nextPage" } }]), legacy("nav", [{ slot: 0, action: { type: "nav.prevPage" } }])];
    expect(readStoredBoards(stored)).toEqual([
      board("empty", "voice"),
      board("talk", "voice", [{ slot: 3, action: speak("Hi") }, { slot: 9, action: { type: "nav.nextPage" } }]),
      board("nav", "voice", [{ slot: 0, action: { type: "nav.prevPage" } }]),
    ]);
  });

  it("become deck boards when they hold OBS or caption keys and no voice keys", () => {
    const keys: Key[] = [{ slot: 2, action: scene("Main") }, { slot: 7, action: { type: "nav.goToPage", page: 2 } }, { slot: 20, action: { type: "captions.clear" } }];
    expect(readStoredBoards([legacy("obs", keys, "OBS"), legacy("cc", [{ slot: 0, action: { type: "captions.toggle" } }])])).toEqual([
      board("obs", "deck", keys, "OBS"),
      board("cc", "deck", [{ slot: 0, action: { type: "captions.toggle" } }]),
    ]);
  });

  it("splits a mixed board in two without moving or dropping any key", () => {
    const mixed = legacy(
      "main",
      [
        { slot: 0, label: "Hi", color: "#112233", action: speak("Hello") },
        { slot: 4, action: scene("Main") },
        { slot: 9, action: { type: "nav.nextPage" } },
        { slot: 12, action: { type: "captions.clear" } },
        { slot: 14, action: { type: "voice.toggleLanguage" } },
        { slot: 31, icon: "mic", action: { type: "obs.toggleMute", inputName: "Mic" } },
      ],
      "Main",
    );
    expect(readStoredBoards([legacy("first"), mixed, legacy("last")])).toEqual([
      board("first", "voice"),
      board(
        "main",
        "voice",
        [
          { slot: 0, label: "Hi", color: "#112233", action: speak("Hello") },
          { slot: 9, action: { type: "nav.nextPage" } },
          { slot: 12, action: { type: "captions.clear" } },
          { slot: 14, action: { type: "voice.toggleLanguage" } },
        ],
        "Main",
      ),
      board(
        "main-deck",
        "deck",
        [
          { slot: 4, action: scene("Main") },
          { slot: 31, icon: "mic", action: { type: "obs.toggleMute", inputName: "Mic" } },
        ],
        "Main (Deck)",
      ),
      board("last", "voice"),
    ]);
  });

  it("gives the split deck board an id no other stored board uses", () => {
    const mixed = [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }];
    const boards = readStoredBoards([legacy("a", mixed), legacy("a-deck", mixed), legacy("a-deck-2")]);
    expect(boards.map((b) => [b.id, b.kind])).toEqual([
      ["a", "voice"],
      ["a-deck-3", "deck"],
      ["a-deck", "voice"],
      ["a-deck-deck", "deck"],
      ["a-deck-2", "voice"],
    ]);
    expect(boards.reduce((total, b) => total + b.keys.length, 0)).toBe(4);
  });

  it("keeps the split board's id and name within their limits", () => {
    const mixed = [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }];
    const [, deck] = readStoredBoards([legacy("i".repeat(100), mixed, "N".repeat(MAX_BOARD_NAME_LENGTH))]);
    expect(deck!.id).toHaveLength(100);
    expect(deck!.id.endsWith("-deck")).toBe(true);
    expect(deck!.name).toBe(`${"N".repeat(MAX_BOARD_NAME_LENGTH - 7)} (Deck)`);
  });

  it("is idempotent: migrated boards read back unchanged", () => {
    const stored = [
      legacy("main", [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }]),
      legacy("obs", [{ slot: 5, action: { type: "obs.toggleStream" } }]),
      legacy("talk", [{ slot: 2, action: speak("Yes") }]),
    ];
    const once = readStoredBoards(stored);
    expect(once.map((b) => b.id)).toEqual(["main", "main-deck", "obs", "talk"]);
    expect(readStoredBoards(JSON.parse(JSON.stringify(once)))).toEqual(once);
    expect(readStoredBoards(stored)).toEqual(once);
  });

  it("goes past the board limit rather than losing the keys of a split board", () => {
    const mixed = [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }];
    const stored = Array.from({ length: MAX_BOARDS }, (_, index) => legacy(`b${index}`, mixed));
    const once = readStoredBoards(stored);
    expect(once).toHaveLength(MAX_BOARDS * 2);
    expect(once.reduce((total, b) => total + b.keys.length, 0)).toBe(MAX_BOARDS * 2);
    expect(readStoredBoards(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("treats an unknown kind as missing", () => {
    expect(readStoredBoards([{ ...legacy("x", [{ slot: 0, action: scene("Main") }]), kind: "radio" }])).toEqual([board("x", "deck", [{ slot: 0, action: scene("Main") }])]);
  });

  it("keeps a key that opens another board on the voice half of a split board, in its slot", () => {
    const goToBoard: Key = { slot: 7, label: "More", action: { type: "nav.goToBoard", boardId: "other" } };
    const mixed = legacy("main", [{ slot: 0, action: speak("Hi") }, { slot: 3, action: scene("Main") }, goToBoard]);
    const [voice, deck] = readStoredBoards([mixed, legacy("other")]);
    expect(voice).toEqual(board("main", "voice", [{ slot: 0, action: speak("Hi") }, goToBoard]));
    expect(deck).toEqual(board("main-deck", "deck", [{ slot: 3, action: scene("Main") }], "main (Deck)"));
  });

  it("never cuts a surrogate pair when it shortens the split board's name or id", () => {
    const mixed = [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }];
    // The limits fall in the middle of the last emoji of each: 33 name units and 95 id units are both odd.
    const [, deck] = readStoredBoards([legacy("😀".repeat(50), mixed, "😀".repeat(MAX_BOARD_NAME_LENGTH / 2))]);
    expect(deck!.name).toBe(`${"😀".repeat(16)} (Deck)`);
    expect(deck!.id).toBe(`${"😀".repeat(47)}-deck`);
    const loneHighSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;
    expect(loneHighSurrogate.test(deck!.name)).toBe(false);
    expect(loneHighSurrogate.test(deck!.id)).toBe(false);
  });
});

describe("stored boards whose kind does not allow some of their keys", () => {
  it("moves the keys a voice board cannot hold to a new deck board, slots unchanged", () => {
    const stored = [
      board("v", "voice", [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }, { slot: 5, action: { type: "nav.nextPage" } }, { slot: 20, action: { type: "captions.clear" } }], "Talk"),
      board("last", "deck"),
    ];
    expect(readStoredBoards(stored)).toEqual([
      board("v", "voice", [{ slot: 0, action: speak("Hi") }, { slot: 5, action: { type: "nav.nextPage" } }, { slot: 20, action: { type: "captions.clear" } }], "Talk"),
      board("v-deck", "deck", [{ slot: 1, action: scene("Main") }], "Talk (Deck)"),
      board("last", "deck"),
    ]);
  });

  it("moves the voice keys of a deck board to a new voice board, slots unchanged", () => {
    const stored = [board("d", "deck", [{ slot: 2, action: scene("Main") }, { slot: 4, label: "Hi", action: speak("Hello") }, { slot: 9, action: { type: "nav.prevPage" } }], "Stream")];
    expect(readStoredBoards(stored)).toEqual([
      board("d", "deck", [{ slot: 2, action: scene("Main") }, { slot: 9, action: { type: "nav.prevPage" } }], "Stream"),
      board("d-voice", "voice", [{ slot: 4, label: "Hi", action: speak("Hello") }], "Stream (Voice)"),
    ]);
  });

  it("is idempotent and gives the new board an id no other board uses", () => {
    const stored = [board("v", "voice", [{ slot: 0, action: speak("Hi") }, { slot: 1, action: scene("Main") }]), board("v-deck", "deck", [{ slot: 1, action: scene("BRB") }])];
    const once = readStoredBoards(stored);
    expect(once.map((b) => [b.id, b.kind, b.keys.length])).toEqual([
      ["v", "voice", 1],
      ["v-deck-2", "deck", 1],
      ["v-deck", "deck", 1],
    ]);
    expect(readStoredBoards(JSON.parse(JSON.stringify(once)))).toEqual(once);
    expect(readStoredBoards(stored)).toEqual(once);
  });
});

describe("default boards", () => {
  it("ships a voice board with the voice commands and the caption keys in the slots they always had", () => {
    const voice = buildDefaultBoard("en");
    expect(voice).toMatchObject({ id: DEFAULT_BOARD_ID, kind: "voice", name: "Communication" });
    expect(voice.keys.filter((key) => key.action.type !== "voice.speak").map((key) => [key.slot, key.action.type])).toEqual([
      [10, "voice.stop"],
      [11, "voice.repeat"],
      [12, "captions.clear"],
      [13, "captions.toggle"],
      [14, "voice.toggleLanguage"],
    ]);
    expect(voice.keys.every((key) => isActionAllowedOnBoard("voice", key.action.type))).toBe(true);
  });

  it("ships a deck board with the OBS actions that need no parameters, and no caption keys", () => {
    const deck = buildDefaultDeckBoard("es");
    expect(deck).toMatchObject({ id: DEFAULT_DECK_BOARD_ID, kind: "deck", name: "Deck" });
    expect(buildDefaultDeckBoard("en").name).toBe("Deck");
    expect(deck.keys.map((key) => [key.slot, key.action])).toEqual([
      [0, { type: "obs.toggleStream" }],
      [1, { type: "obs.toggleRecord" }],
    ]);
    expect(buildDefaultBoards("en").map((b) => b.id)).toEqual([DEFAULT_BOARD_ID, DEFAULT_DECK_BOARD_ID]);
  });

  it("gives a fresh install both boards, and legacy phrases a voice board plus the deck", async () => {
    const fresh = new InMemoryBoardRepository([]);
    await initializeBoards({ repository: fresh }, { language: "en", legacyPhrases: null });
    expect((await listBoards(fresh)).map((b) => [b.id, b.kind])).toEqual([
      [DEFAULT_BOARD_ID, "voice"],
      [DEFAULT_DECK_BOARD_ID, "deck"],
    ]);

    const migrated = new InMemoryBoardRepository([]);
    await initializeBoards({ repository: migrated }, { language: "es", legacyPhrases: [{ id: "x", text: "Agua", slot: 3, createdAt: 1 }] });
    const [voice, deck] = await listBoards(migrated);
    expect(voice!.keys.map((key) => [key.slot, key.action.type])).toEqual([
      [3, "voice.speak"],
      [10, "voice.stop"],
      [11, "voice.repeat"],
      [12, "captions.clear"],
      [13, "captions.toggle"],
      [14, "voice.toggleLanguage"],
    ]);
    expect(deck).toEqual(buildDefaultDeckBoard("es"));
  });

  it("restores each default board on its own", async () => {
    const repository = new InMemoryBoardRepository([board(DEFAULT_BOARD_ID, "voice", [], "Mine"), board(DEFAULT_DECK_BOARD_ID, "deck", [], "My deck"), board("x", "voice")]);
    expect(await restoreDefaultBoard(repository, "en", DEFAULT_DECK_BOARD_ID)).toEqual(buildDefaultDeckBoard("en"));
    expect((await listBoards(repository)).map((b) => b.name)).toEqual(["Mine", "Deck", "x"]);
    expect(await restoreDefaultBoard(repository, "en")).toEqual(buildDefaultBoard("en"));
    expect((await listBoards(repository)).map((b) => b.name)).toEqual(["Communication", "Deck", "x"]);
    await expect(restoreDefaultBoard(repository, "en", "x")).rejects.toThrow(InvalidBoardError);
  });

  it("puts a deleted default deck back right after the communication board", async () => {
    const repository = new InMemoryBoardRepository([board("x", "voice"), board(DEFAULT_BOARD_ID, "voice"), board("y", "voice")]);
    await restoreDefaultBoard(repository, "en", DEFAULT_DECK_BOARD_ID);
    expect((await listBoards(repository)).map((b) => b.id)).toEqual(["x", DEFAULT_BOARD_ID, DEFAULT_DECK_BOARD_ID, "y"]);

    const alone = new InMemoryBoardRepository([board("x", "voice")]);
    await restoreDefaultBoard(alone, "en", DEFAULT_DECK_BOARD_ID);
    expect((await listBoards(alone)).map((b) => b.id)).toEqual(["x", DEFAULT_DECK_BOARD_ID]);
  });
});
