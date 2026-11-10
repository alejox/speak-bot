import { DEFAULT_BOARD_ID, DEFAULT_PHRASES_BY_LANGUAGE } from "@speed-deck/core";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareBoards } from "../src/adapters/board-migration";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";

describe("prepareBoards", () => {
  let dir: string;
  let repository: JsonFileBoardRepository;
  let legacyFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-migrate-"));
    repository = new JsonFileBoardRepository(join(dir, "boards.json"));
    legacyFile = join(dir, "phrases.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates the default communication and deck boards in the given language on a new install", async () => {
    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "en" })).toBe("created-default");
    const [board, deck] = await repository.list();
    expect([board!.kind, deck!.kind]).toEqual(["voice", "deck"]);
    expect(board!.id).toBe(DEFAULT_BOARD_ID);
    expect(board!.name).toBe("Communication");
    expect(board!.keys.slice(0, 8).map((key) => (key.action as { text: string }).text)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.en]);
  });

  it("migrates an old phrases file once, keeping slots and a backup of the file", async () => {
    // Older versions stored phrases without slots; slots then follow creation order.
    const legacy = [
      { id: "b", text: "Agua", createdAt: 2 },
      { id: "a", text: "Hola", label: "Saludo", createdAt: 1 },
      { id: "c", text: "Gracias", slot: 9, createdAt: 3 },
      { id: "bad", text: "", createdAt: 4 },
    ];
    await writeFile(legacyFile, JSON.stringify(legacy));

    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "es" })).toBe("migrated");
    const [board, deck] = await repository.list();
    expect(deck).toMatchObject({ id: "deck", kind: "deck" });
    expect(board!.name).toBe("Comunicación");
    expect(board!.keys.slice(0, 3)).toEqual([
      { slot: 0, label: "Saludo", action: { type: "voice.speak", text: "Hola" } },
      { slot: 1, action: { type: "voice.speak", text: "Agua" } },
      { slot: 9, action: { type: "voice.speak", text: "Gracias" } },
    ]);
    expect(board!.keys.slice(3).map((key) => key.slot)).toEqual([10, 11, 12, 13, 14]);

    const files = await readdir(dir);
    expect(files).not.toContain("phrases.json");
    expect(JSON.parse(await readFile(join(dir, "phrases.json.migrated.bak"), "utf8"))).toEqual(legacy);

    // Running again changes nothing, even if an old version wrote phrases.json again.
    await writeFile(legacyFile, JSON.stringify([{ id: "z", text: "New", createdAt: 9 }]));
    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "es" })).toBe("unchanged");
    expect((await repository.list())[0]!.keys[0]!.action).toEqual({ type: "voice.speak", text: "Hola" });
  });

  it("falls back to the default board when the old phrases file is corrupt", async () => {
    await writeFile(legacyFile, "{ broken");
    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "es" })).toBe("created-default");
    expect((await repository.list())[0]!.keys[0]!.action).toEqual({ type: "voice.speak", text: "Hola" });
  });

  it("skips phrases a board key cannot hold instead of failing startup", async () => {
    const legacy = [
      { id: "a", text: "Hola", createdAt: 1 },
      { id: "long", text: "x".repeat(5000), createdAt: 2 },
      { id: "b", text: "Agua", label: "y".repeat(500), createdAt: 3 },
      { id: "far", text: "Lejos", slot: 1_000_000, createdAt: 4 },
    ];
    await writeFile(legacyFile, JSON.stringify(legacy));
    const logs: string[] = [];

    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "es", log: (message) => logs.push(message) })).toBe("migrated");
    const [board] = await repository.list();
    const texts = board!.keys.flatMap((key) => (key.action.type === "voice.speak" ? [key.action.text] : []));
    expect(texts).toEqual(["Hola", "Agua", "Lejos"]);
    expect(texts.join("")).not.toContain("xxxx");
    expect(logs.join("\n")).toContain("Skipped 1 saved phrase");
  });

  it("moves caption keys stored on deck boards to the communication board and stores the result once", async () => {
    const voice = { id: DEFAULT_BOARD_ID, name: "Comunicación", kind: "voice", columns: 5, rows: 3, keys: [{ slot: 2, action: { type: "voice.speak", text: "Hola" } }] };
    const deck = {
      id: "deck",
      name: "Deck",
      kind: "deck",
      columns: 5,
      rows: 3,
      keys: [
        { slot: 0, action: { type: "obs.toggleStream" } },
        { slot: 2, label: "Borrar", action: { type: "captions.clear" } },
        { slot: 3, action: { type: "captions.toggle" } },
      ],
    };
    await writeFile(join(dir, "boards.json"), JSON.stringify({ version: 1, boards: [voice, deck] }));
    const logs: string[] = [];

    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "es", log: (message) => logs.push(message) })).toBe("unchanged");
    const stored = JSON.parse(await readFile(join(dir, "boards.json"), "utf8"));
    expect(stored.boards[1].keys).toEqual([{ slot: 0, action: { type: "obs.toggleStream" } }]);
    expect(stored.boards[0].keys).toEqual([
      { slot: 2, action: { type: "voice.speak", text: "Hola" } },
      { slot: 3, action: { type: "captions.toggle" } },
      { slot: 12, label: "Borrar", action: { type: "captions.clear" } },
    ]);
    expect(logs.join("\n")).toContain("Moved 2 caption keys from deck boards to Voice");

    const written = await readFile(join(dir, "boards.json"), "utf8");
    logs.length = 0;
    expect(await prepareBoards(repository, { legacyPhrasesFile: legacyFile, language: "es", log: (message) => logs.push(message) })).toBe("unchanged");
    expect(await readFile(join(dir, "boards.json"), "utf8")).toBe(written);
    expect(logs).toEqual([]);
  });
});
