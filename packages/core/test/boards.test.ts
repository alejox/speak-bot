import { describe, expect, it } from "vitest";
import {
  ACTION_CATEGORIES,
  ACTION_REGISTRY,
  ACTION_TYPES,
  BoardNotFoundError,
  boardFromPhrases,
  buildDefaultBoard,
  clearKey,
  COMMUNICATION_ACTIONS,
  createBoard,
  createKey,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAMES,
  DEFAULT_PHRASES_BY_LANGUAGE,
  deleteBoard,
  initializeBoards,
  BoardLimitError,
  InvalidBoardError,
  MAX_BOARDS,
  KEY_ICON_IDS,
  KeyNotFoundError,
  KEYS_PER_PAGE,
  LastBoardError,
  listBoards,
  MAX_KEY_SLOTS,
  moveKey,
  parseAction,
  readStoredBoards,
  renameBoard,
  restoreDefaultBoard,
  setKey,
  SlotOccupiedError,
  type Action,
  type Board,
  type Phrase,
} from "../src/index";
import { InMemoryBoardRepository, sequentialIds } from "./fakes";

const speak = (text: string): Action => ({ type: "voice.speak", text });
const board = (id: string, keys: Board["keys"] = [], name = id): Board => ({ id, name, columns: 5, rows: 3, keys });

describe("action registry", () => {
  it("describes every action type with a category, executor side and i18n keys", () => {
    expect(ACTION_TYPES).toHaveLength(15);
    for (const type of ACTION_TYPES) {
      const definition = ACTION_REGISTRY[type];
      expect(definition.type).toBe(type);
      expect(ACTION_CATEGORIES).toContain(definition.category);
      expect(KEY_ICON_IDS).toContain(definition.defaultIcon);
      expect(definition.labelKey).toBe(`action.${type}`);
      expect(definition.descriptionKey).toBe(`action.${type}.description`);
      expect(type.startsWith("obs.")).toBe(definition.requiresObs);
      expect(definition.runsOn).toBe(type.startsWith("nav.") ? "client" : "server");
      if (definition.requiresObs) expect(definition.requiresDesktop).toBe(true);
    }
  });

  it("names the parameters each action needs", () => {
    expect(ACTION_REGISTRY["voice.speak"].params.map((p) => [p.name, p.kind])).toEqual([["text", "text"]]);
    expect(ACTION_REGISTRY["nav.goToPage"].params.map((p) => [p.name, p.kind])).toEqual([["page", "number"]]);
    expect(ACTION_REGISTRY["nav.goToBoard"].params.map((p) => [p.name, p.kind])).toEqual([["boardId", "board"]]);
    expect(ACTION_REGISTRY["obs.switchScene"].params.map((p) => [p.name, p.kind])).toEqual([["sceneName", "scene"]]);
    expect(ACTION_REGISTRY["obs.toggleMute"].params.map((p) => [p.name, p.kind])).toEqual([["inputName", "input"]]);
    expect(ACTION_REGISTRY["obs.toggleSourceVisibility"].params.map((p) => [p.name, p.kind])).toEqual([
      ["sceneName", "scene"],
      ["sourceName", "source"],
    ]);
    expect(ACTION_REGISTRY["captions.clear"].requiresDesktop).toBe(true);
    expect(ACTION_REGISTRY["voice.speak"].requiresDesktop).toBe(false);
  });
});

describe("parseAction", () => {
  it("accepts every action type with valid parameters and drops unknown properties", () => {
    expect(parseAction({ type: "voice.speak", text: "  Hola  ", extra: 1 })).toEqual({ type: "voice.speak", text: "Hola" });
    expect(parseAction({ type: "voice.stop" })).toEqual({ type: "voice.stop" });
    expect(parseAction({ type: "nav.goToPage", page: 3 })).toEqual({ type: "nav.goToPage", page: 3 });
    expect(parseAction({ type: "obs.switchScene", sceneName: " Main " })).toEqual({ type: "obs.switchScene", sceneName: " Main " });
    expect(parseAction({ type: "obs.toggleSourceVisibility", sceneName: "Main", sourceName: "Cam" })).toEqual({
      type: "obs.toggleSourceVisibility",
      sceneName: "Main",
      sourceName: "Cam",
    });
  });

  it.each([
    null,
    "voice.stop",
    [],
    { type: "system.shutdown" },
    { type: "toString" },
    { type: "voice.speak" },
    { type: "voice.speak", text: "   " },
    { type: "voice.speak", text: "x".repeat(1001) },
    { type: "nav.goToPage", page: 0 },
    { type: "nav.goToPage", page: 1.5 },
    { type: "nav.goToPage", page: "2" },
    { type: "nav.goToBoard", boardId: "" },
    { type: "obs.toggleMute", inputName: 5 },
    { type: "obs.toggleSourceVisibility", sceneName: "Main" },
  ])("rejects %j", (value) => {
    expect(() => parseAction(value)).toThrow(InvalidBoardError);
  });
});

describe("createKey", () => {
  it("validates slot, label, icon and color", () => {
    expect(createKey({ slot: 4, label: " Hi ", icon: "heart", color: "#AABBCC", action: speak("Hello") })).toEqual({
      slot: 4,
      label: "Hi",
      icon: "heart",
      color: "#aabbcc",
      action: speak("Hello"),
    });
    expect(createKey({ slot: 0, label: "", action: { type: "voice.stop" } })).toEqual({ slot: 0, action: { type: "voice.stop" } });
  });

  it.each([
    { slot: -1, action: speak("a") },
    { slot: MAX_KEY_SLOTS, action: speak("a") },
    { slot: 1.5, action: speak("a") },
    { slot: 0, label: "x".repeat(41), action: speak("a") },
    { slot: 0, icon: "not-an-icon", action: speak("a") },
    { slot: 0, icon: "x".repeat(41), action: speak("a") },
    { slot: 0, color: "red", action: speak("a") },
    { slot: 0, color: "#abc", action: speak("a") },
    { slot: 0, color: "#gggggg", action: speak("a") },
    { slot: 0, action: { type: "voice.speak", text: "" } },
    { slot: 0 },
  ])("rejects %j", (input) => {
    expect(() => createKey(input)).toThrow(InvalidBoardError);
  });
});

describe("readStoredBoards", () => {
  it("keeps valid boards and drops invalid keys, duplicate slots and duplicate board ids", () => {
    const stored = [
      { id: "a", name: "A", columns: 5, rows: 3, keys: [{ slot: 1, action: speak("one") }, { slot: 1, action: speak("dup") }, { slot: 2, action: { type: "nope" } }] },
      { id: "a", name: "Again", columns: 5, rows: 3, keys: [] },
      { id: "", name: "No id", keys: [] },
      "garbage",
    ];
    expect(readStoredBoards(stored)).toEqual([board("a", [{ slot: 1, action: speak("one") }], "A")]);
    expect(readStoredBoards({ not: "an array" })).toEqual([]);
  });
});

describe("default and migrated boards", () => {
  it("builds the Comunicación board with phrases first and communication actions on the last row", () => {
    const es = buildDefaultBoard("es");
    expect(es.id).toBe(DEFAULT_BOARD_ID);
    expect(es.name).toBe("Comunicación");
    expect(DEFAULT_BOARD_NAMES.en).toBe("Communication");
    const phrases = es.keys.filter((key) => key.action.type === "voice.speak");
    expect(phrases.map((key) => (key.action as { text: string }).text)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.es]);
    expect(phrases.map((key) => key.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const actions = es.keys.filter((key) => key.action.type !== "voice.speak");
    expect(actions.map((key) => key.slot)).toEqual([10, 11, 12, 13, 14]);
    expect(actions.map((key) => key.action)).toEqual([...COMMUNICATION_ACTIONS]);
    expect(buildDefaultBoard("en").keys[0]!.action).toEqual(speak("Hello"));
  });

  const phrase = (slot: number, text: string, label?: string): Phrase => ({ id: `p${slot}`, text, slot, createdAt: slot, ...(label ? { label } : {}) });

  it("migrates phrases keeping their slots and puts actions on the free last row", () => {
    const migrated = boardFromPhrases([phrase(0, "Hola", "Hi"), phrase(7, "Agua")], "es");
    expect(migrated.name).toBe("Comunicación");
    expect(migrated.keys.slice(0, 2)).toEqual([
      { slot: 0, label: "Hi", action: speak("Hola") },
      { slot: 7, action: speak("Agua") },
    ]);
    expect(migrated.keys.slice(2).map((key) => key.slot)).toEqual([10, 11, 12, 13, 14]);
  });

  it("puts the actions on the next page whose last row is free", () => {
    const migrated = boardFromPhrases([phrase(12, "Hola"), phrase(27, "Busy")], "en");
    const actionSlots = migrated.keys.filter((key) => key.action.type !== "voice.speak").map((key) => key.slot);
    expect(actionSlots).toEqual([3 * KEYS_PER_PAGE - 5, 3 * KEYS_PER_PAGE - 4, 3 * KEYS_PER_PAGE - 3, 3 * KEYS_PER_PAGE - 2, 3 * KEYS_PER_PAGE - 1]);
  });

  it("shortens labels that are too long for a key", () => {
    const migrated = boardFromPhrases([phrase(0, "Hola", "L".repeat(100))], "es");
    expect(migrated.keys[0]!.label).toBe("L".repeat(40));
  });
});

describe("board use cases", () => {
  const setup = (boards: Board[] = [board("b1", [{ slot: 0, action: speak("Hi") }])]) => {
    const repository = new InMemoryBoardRepository(boards);
    return { repository, deps: { repository, generateId: sequentialIds("board") } };
  };

  it("initializes a default board once, migrating legacy phrases when given", async () => {
    const empty = setup([]);
    expect(await initializeBoards(empty.deps, { language: "en", legacyPhrases: null })).toBe(true);
    expect((await listBoards(empty.repository)).map((b) => b.name)).toEqual(["Communication"]);
    expect(await initializeBoards(empty.deps, { language: "es", legacyPhrases: null })).toBe(false);
    expect(empty.repository.writeCount).toBe(1);

    const legacy = setup([]);
    await initializeBoards(legacy.deps, { language: "es", legacyPhrases: [{ id: "x", text: "Agua", slot: 3, createdAt: 1 }] });
    const [migrated] = await listBoards(legacy.repository);
    expect(migrated!.keys[0]).toEqual({ slot: 3, action: speak("Agua") });
  });

  it("creates, renames and deletes boards but never the last one", async () => {
    const { repository, deps } = setup();
    const created = await createBoard(deps, { name: "  OBS  " });
    expect(created).toEqual(board("board-1", [], "OBS"));
    expect(await renameBoard(repository, "board-1", "Escenas")).toEqual(board("board-1", [], "Escenas"));
    await expect(renameBoard(repository, "missing", "x")).rejects.toThrow(BoardNotFoundError);
    await expect(renameBoard(repository, "b1", " ")).rejects.toThrow(InvalidBoardError);
    await expect(createBoard(deps, { name: "x".repeat(41) })).rejects.toThrow(InvalidBoardError);

    await deleteBoard(repository, "b1");
    expect((await listBoards(repository)).map((b) => b.id)).toEqual(["board-1"]);
    await expect(deleteBoard(repository, "board-1")).rejects.toThrow(LastBoardError);
    await expect(deleteBoard(repository, "missing")).rejects.toThrow(BoardNotFoundError);
  });

  it("sets a key in a free slot and only overwrites an occupied one when asked", async () => {
    const { repository } = setup();
    const key = await setKey(repository, "b1", { slot: 2, label: "Go", icon: "scene", color: "#112233", action: { type: "obs.switchScene", sceneName: "Main" } });
    expect(key.slot).toBe(2);
    await expect(setKey(repository, "b1", { slot: 0, action: speak("Other") })).rejects.toThrow(SlotOccupiedError);
    await setKey(repository, "b1", { slot: 0, action: speak("Other") }, { replace: true });
    const [saved] = await listBoards(repository);
    expect(saved!.keys.map((k) => [k.slot, k.action.type])).toEqual([
      [0, "voice.speak"],
      [2, "obs.switchScene"],
    ]);
    expect(saved!.keys[0]!.action).toEqual(speak("Other"));
    await expect(setKey(repository, "missing", { slot: 1, action: speak("a") })).rejects.toThrow(BoardNotFoundError);
    await expect(setKey(repository, "b1", { slot: 1, action: { type: "bad" } })).rejects.toThrow(InvalidBoardError);
  });

  it("clears keys, ignoring empty slots", async () => {
    const { repository } = setup();
    await clearKey(repository, "b1", 0);
    await clearKey(repository, "b1", 5);
    expect((await listBoards(repository))[0]!.keys).toEqual([]);
    await expect(clearKey(repository, "missing", 0)).rejects.toThrow(BoardNotFoundError);
    await expect(clearKey(repository, "b1", -1)).rejects.toThrow(InvalidBoardError);
  });

  it("moves a key to a free slot or swaps it with the key there", async () => {
    const { repository } = setup([board("b1", [{ slot: 0, action: speak("A") }, { slot: 1, action: speak("B") }])]);
    let moved = await moveKey(repository, "b1", 0, 5);
    expect(moved.keys.map((k) => [k.slot, (k.action as { text: string }).text])).toEqual([
      [1, "B"],
      [5, "A"],
    ]);
    moved = await moveKey(repository, "b1", 1, 5);
    expect(moved.keys.map((k) => [k.slot, (k.action as { text: string }).text])).toEqual([
      [1, "A"],
      [5, "B"],
    ]);
    await expect(moveKey(repository, "b1", 3, 4)).rejects.toThrow(KeyNotFoundError);
    await expect(moveKey(repository, "b1", 1, MAX_KEY_SLOTS)).rejects.toThrow(InvalidBoardError);
  });

  it("restores the default board in place, or adds it first when it was deleted", async () => {
    const { repository } = setup([board("x"), board(DEFAULT_BOARD_ID, [], "Mine")]);
    const restored = await restoreDefaultBoard(repository, "en");
    expect(restored.name).toBe("Communication");
    expect((await listBoards(repository)).map((b) => b.id)).toEqual(["x", DEFAULT_BOARD_ID]);

    const other = setup([board("x")]);
    await restoreDefaultBoard(other.repository, "es");
    expect((await listBoards(other.repository)).map((b) => b.id)).toEqual([DEFAULT_BOARD_ID, "x"]);
  });

  it("reports the board limit instead of restoring the default board past it", async () => {
    const full = Array.from({ length: MAX_BOARDS }, (_, index) => board(`b${index}`));
    const { repository } = setup(full);
    await expect(restoreDefaultBoard(repository, "es")).rejects.toThrow(BoardLimitError);
    expect(repository.writeCount).toBe(0);

    // Restoring in place still works with a full set of boards.
    const withDefault = setup([...full.slice(1), board(DEFAULT_BOARD_ID, [], "Mine")]);
    expect((await restoreDefaultBoard(withDefault.repository, "en")).name).toBe("Communication");
  });

  it("writes nothing when a change is rejected", async () => {
    const { repository } = setup();
    await expect(setKey(repository, "b1", { slot: 0, action: speak("x") })).rejects.toThrow();
    expect(repository.writeCount).toBe(0);
  });
});
