import { createBoard, DEFAULT_BOARD_ID, DEFAULT_DECK_BOARD_ID, DEFAULT_PHRASES_BY_LANGUAGE, listBoards, setKey, SlotOccupiedError } from "@speed-deck/core";
import { beforeEach, describe, expect, it } from "vitest";
import { BOARDS_STORAGE_KEY, LocalStorageBoardRepository, prepareLocalBoards } from "../src/adapters/local-storage-board-repository";
import { PHRASES_STORAGE_KEY } from "../src/adapters/local-storage-phrase-repository";

describe("LocalStorageBoardRepository", () => {
  beforeEach(() => localStorage.clear());

  it("creates the default boards in the interface language on a new device", async () => {
    const repository = new LocalStorageBoardRepository(localStorage);
    expect(await prepareLocalBoards(repository, "es")).toBe(true);
    expect(await prepareLocalBoards(repository, "en")).toBe(false);

    const [board, deck] = await listBoards(new LocalStorageBoardRepository(localStorage));
    expect(board).toMatchObject({ id: DEFAULT_BOARD_ID, name: "Comunicación", kind: "voice" });
    expect(deck).toMatchObject({ id: DEFAULT_DECK_BOARD_ID, name: "Deck", kind: "deck" });
    expect(board!.keys.slice(0, 8).map((key) => (key.action as { text: string }).text)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.es]);
    expect(JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY)!)).toMatchObject({ version: 1 });
  });

  it("migrates the phrases saved on this device, keeping their slots and the old key", async () => {
    const legacy = [
      { id: "a", text: "Hola", label: "Saludo", slot: 4, createdAt: 1 },
      { id: "b", text: "Agua", createdAt: 2 },
    ];
    localStorage.setItem(PHRASES_STORAGE_KEY, JSON.stringify(legacy));

    await prepareLocalBoards(new LocalStorageBoardRepository(localStorage), "en");

    const [board] = await listBoards(new LocalStorageBoardRepository(localStorage));
    expect(board!.name).toBe("Communication");
    expect(board!.keys.slice(0, 2)).toEqual([
      { slot: 0, action: { type: "voice.speak", text: "Agua" } },
      { slot: 4, label: "Saludo", action: { type: "voice.speak", text: "Hola" } },
    ]);
    expect(JSON.parse(localStorage.getItem(PHRASES_STORAGE_KEY)!)).toEqual(legacy);
  });

  it("runs the core use cases and rejects an occupied slot without writing", async () => {
    const repository = new LocalStorageBoardRepository(localStorage);
    await prepareLocalBoards(repository, "en");
    await expect(setKey(repository, DEFAULT_BOARD_ID, { slot: 0, action: { type: "voice.stop" } })).rejects.toThrow(SlotOccupiedError);
    await createBoard({ repository, generateId: () => "b2" }, { name: "OBS", kind: "deck" });
    expect((await listBoards(new LocalStorageBoardRepository(localStorage))).map((b) => b.id)).toEqual([DEFAULT_BOARD_ID, DEFAULT_DECK_BOARD_ID, "b2"]);
  });

  it("gives boards stored without a kind one, splitting a mixed board without moving or losing keys", async () => {
    const speak = { slot: 0, action: { type: "voice.speak", text: "Hello" } };
    const language = { slot: 14, action: { type: "voice.toggleLanguage" } };
    const captions = { slot: 12, action: { type: "captions.clear" } };
    const scene = { slot: 20, label: "Main", action: { type: "obs.switchScene", sceneName: "Main" } };
    const stored = { version: 1, boards: [{ id: "communication", name: "Communication", columns: 5, rows: 3, keys: [speak, captions, language, scene] }] };
    localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(stored));

    const repository = new LocalStorageBoardRepository(localStorage);
    const migrated = [
      { id: "communication", name: "Communication", kind: "voice", columns: 5, rows: 3, keys: [speak, language] },
      { id: "communication-deck", name: "Communication (Deck)", kind: "deck", columns: 5, rows: 3, keys: [captions, scene] },
    ];
    expect(await repository.list()).toEqual(migrated);
    expect(await prepareLocalBoards(repository, "en")).toBe(false);

    // The first change stores the migrated boards, and reading them back changes nothing.
    await setKey(repository, "communication", { slot: 1, action: { type: "voice.stop" } });
    const written = JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY)!) as { boards: unknown[] };
    expect(written.boards[1]).toEqual(migrated[1]);
    expect(await new LocalStorageBoardRepository(localStorage).list()).toEqual(written.boards);
  });

  it("drops invalid stored data and keeps working in memory without storage", async () => {
    localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify({ version: 1, boards: [{ id: "x", name: "X", keys: [{ slot: 0, action: { type: "evil" } }] }] }));
    expect(await new LocalStorageBoardRepository(localStorage).list()).toEqual([{ id: "x", name: "X", kind: "voice", columns: 5, rows: 3, keys: [] }]);

    const memory = new LocalStorageBoardRepository(null);
    await prepareLocalBoards(memory, "es");
    expect(await memory.list()).toHaveLength(2);
  });
});
