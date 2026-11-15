import { DEFAULT_BOARD_ID, createBoard, listBoards, setBoardGrid, setKey, SlotOccupiedError, type Board } from "@speed-deck/core";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonFileRecovery } from "../src/adapters/json-file";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";

const board = (id: string, keys: Board["keys"] = []): Board => ({ id, name: id.toUpperCase(), kind: "voice", columns: 5, rows: 3, keys });

describe("JsonFileBoardRepository", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-boards-"));
    file = join(dir, "boards.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("starts empty and persists boards across instances in a versioned file", async () => {
    const repository = new JsonFileBoardRepository(file);
    expect(await repository.list()).toEqual([]);

    await repository.update(() => ({ boards: [board("a", [{ slot: 2, action: { type: "voice.stop" } }])], result: undefined }));

    expect(await new JsonFileBoardRepository(file).list()).toEqual([board("a", [{ slot: 2, action: { type: "voice.stop" } }])]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: 1, boards: [board("a", [{ slot: 2, action: { type: "voice.stop" } }])] });
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps the grid boards of a kind share across instances", async () => {
    const repository = new JsonFileBoardRepository(file);
    await repository.update(() => ({ boards: [board("a", [{ slot: 4, action: { type: "voice.stop" } }]), board("b")], result: undefined }));
    await setBoardGrid(repository, { kind: "voice", columns: 6, rows: 4 });
    const stored = await new JsonFileBoardRepository(file).list();
    expect(stored.map(({ columns, rows }) => ({ columns, rows }))).toEqual([
      { columns: 6, rows: 4 },
      { columns: 6, rows: 4 },
    ]);
    expect(stored[0]!.keys.map((key) => key.slot)).toEqual([4]);
  });

  it("drops invalid stored keys and boards on read", async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        boards: [
          { id: "a", name: "A", columns: 5, rows: 3, keys: [{ slot: 0, action: { type: "system.run", command: "rm -rf /" } }, { slot: 1, action: { type: "voice.stop" } }] },
          { id: 7, name: "bad" },
        ],
      }),
    );
    expect(await new JsonFileBoardRepository(file).list()).toEqual([{ id: "a", name: "A", kind: "voice", columns: 5, rows: 3, keys: [{ slot: 1, action: { type: "voice.stop" } }] }]);
  });

  it("gives boards stored without a kind one, splitting a mixed board without moving or losing keys", async () => {
    const speak = { slot: 0, action: { type: "voice.speak", text: "Hola" } };
    const captions = { slot: 12, action: { type: "captions.clear" } };
    const scene = { slot: 20, label: "Main", action: { type: "obs.switchScene", sceneName: "Main" } };
    const stored = { version: 1, boards: [{ id: "communication", name: "Comunicación", columns: 5, rows: 3, keys: [speak, captions, scene] }] };
    await writeFile(file, JSON.stringify(stored));
    const repository = new JsonFileBoardRepository(file);
    const migrated = [
      // Captions belong to Voice, so only the OBS key moves.
      { id: "communication", name: "Comunicación", kind: "voice", columns: 5, rows: 3, keys: [speak, captions] },
      { id: "communication-deck", name: "Comunicación (Deck)", kind: "deck", columns: 5, rows: 3, keys: [scene] },
    ];
    expect(await repository.list()).toEqual(migrated);
    // Reading alone does not rewrite the file; the first change stores the migrated boards.
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(stored);

    await setKey(repository, "communication-deck", { slot: 1, action: { type: "obs.toggleStream" } });
    const written = JSON.parse(await readFile(file, "utf8")) as { boards: Board[] };
    expect(written.boards[0]).toEqual(migrated[0]);
    expect(written.boards[1]!.keys.map((key) => key.slot)).toEqual([1, 20]);
    expect(await new JsonFileBoardRepository(file).list()).toEqual(written.boards);
  });

  it("keeps a damaged file aside and starts empty when there is no earlier copy", async () => {
    await writeFile(file, "{ not json");
    const recoveries: JsonFileRecovery[] = [];
    expect(await new JsonFileBoardRepository(file, { onRecovery: (recovery) => recoveries.push(recovery) }).list()).toEqual([]);
    const copies = (await readdir(dir)).filter((name) => name.startsWith("boards.json.corrupt-"));
    expect(copies).toHaveLength(1);
    expect(await readFile(join(dir, copies[0]!), "utf8")).toBe("{ not json");
    expect(recoveries).toMatchObject([{ file, outcome: "reset", damagedCopy: join(dir, copies[0]!) }]);
  });

  it("restores the boards saved before the last change when the file is truncated", async () => {
    const repository = new JsonFileBoardRepository(file);
    await repository.update(() => ({ boards: [board("a")], result: undefined }));
    await repository.update(() => ({ boards: [board("a"), board("b")], result: undefined }));
    await repository.update(() => ({ boards: [board("a"), board("b"), board("c")], result: undefined }));
    const good = await readFile(file, "utf8");
    await writeFile(file, good.slice(0, Math.floor(good.length / 2)));

    const recoveries: JsonFileRecovery[] = [];
    const reopened = new JsonFileBoardRepository(file, { onRecovery: (recovery) => recoveries.push(recovery) });
    expect((await reopened.list()).map(({ id }) => id)).toEqual(["a", "b"]);
    expect(recoveries.map(({ outcome }) => outcome)).toEqual(["restored"]);
    // The restored boards are back in the file itself, and a change after it works as usual.
    await reopened.update((boards) => ({ boards: [...boards, board("d")], result: undefined }));
    expect((await new JsonFileBoardRepository(file).list()).map(({ id }) => id)).toEqual(["a", "b", "d"]);
  });

  it("treats a boards file without a boards list as damaged instead of as no boards", async () => {
    const repository = new JsonFileBoardRepository(file);
    await repository.update(() => ({ boards: [board("a")], result: undefined }));
    await repository.update(() => ({ boards: [board("a"), board("b")], result: undefined }));
    await writeFile(file, "null");
    expect((await new JsonFileBoardRepository(file).list()).map(({ id }) => id)).toEqual(["a"]);
    expect((await readdir(dir)).filter((name) => name.startsWith("boards.json.corrupt-"))).toHaveLength(1);
  });

  it("writes nothing when a change throws or returns no boards", async () => {
    const repository = new JsonFileBoardRepository(file);
    await expect(
      repository.update(() => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(await repository.update(() => ({ result: 5 }))).toBe(5);
    await expect(readFile(file)).rejects.toThrow();
  });

  it("refuses to store invalid boards", async () => {
    const repository = new JsonFileBoardRepository(file);
    const invalid = { ...board("a"), keys: [{ slot: -1, action: { type: "voice.stop" } }] } as Board;
    await expect(repository.update(() => ({ boards: [invalid], result: undefined }))).rejects.toThrow();
    await expect(readFile(file)).rejects.toThrow();
  });

  it("runs every check-then-write as one step, so concurrent writers never lose or duplicate keys", async () => {
    const repository = new JsonFileBoardRepository(file);
    await repository.update(() => ({ boards: [board(DEFAULT_BOARD_ID)], result: undefined }));

    // Twenty clients race for the same free slot: exactly one wins, the rest see it occupied.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => setKey(repository, DEFAULT_BOARD_ID, { slot: 3, action: { type: "voice.speak", text: `Client ${index}` } })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected).toHaveLength(19);
    for (const result of rejected) expect(result.reason).toBeInstanceOf(SlotOccupiedError);

    // Twenty boards created at once all survive.
    let next = 0;
    await Promise.all(Array.from({ length: 20 }, () => createBoard({ repository, generateId: () => `b${++next}` }, { name: "Board", kind: "voice" })));
    const boards = await listBoards(new JsonFileBoardRepository(file));
    expect(boards).toHaveLength(21);
    expect(boards[0]!.keys).toHaveLength(1);
  });
});
