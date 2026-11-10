import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PhraseNotFoundError } from "@speak-bot/core";
import { JsonFilePhraseRepository } from "../src/adapters/json-file-phrase-repository";

describe("JsonFilePhraseRepository", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speak-bot-repo-"));
    file = join(dir, "phrases.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("starts empty and reports that the file does not exist yet", async () => {
    const repository = new JsonFilePhraseRepository(file);

    expect(await repository.exists()).toBe(false);
    expect(await repository.list()).toEqual([]);
  });

  it("saves, replaces and deletes phrases, persisting them across instances", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await repository.save({ id: "a", text: "Hello", slot: 0, createdAt: 1 });
    await repository.save({ id: "b", text: "Bye", slot: 1, createdAt: 2 });
    await repository.save({ id: "a", text: "Hello there", slot: 0, createdAt: 1 });
    await repository.delete("b");

    const reopened = new JsonFilePhraseRepository(file);
    expect(await reopened.exists()).toBe(true);
    expect(await reopened.list()).toEqual([{ id: "a", text: "Hello there", slot: 0, createdAt: 1 }]);
  });

  it("writes atomically without leaving temporary files behind", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await Promise.all([1, 2, 3, 4, 5].map((n) => repository.save({ id: `p${n}`, text: `Phrase ${n}`, slot: n, createdAt: n })));

    expect(await readdir(dir)).toEqual(["phrases.json"]);
    expect((await repository.list()).map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("starts empty and keeps a .bak copy when the file is corrupt", async () => {
    await writeFile(file, "{ not json", "utf8");
    const repository = new JsonFilePhraseRepository(file);

    expect(await repository.list()).toEqual([]);
    expect(await readFile(`${file}.bak`, "utf8")).toBe("{ not json");

    await repository.save({ id: "a", text: "Hello", slot: 0, createdAt: 1 });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual([{ id: "a", text: "Hello", slot: 0, createdAt: 1 }]);
  });

  it("replaces every phrase in one write", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await repository.save({ id: "a", text: "Mine", slot: 0, createdAt: 1 });

    await repository.replaceAll([
      { id: "x", text: "Hola", slot: 0, createdAt: 10 },
      { id: "y", text: "Gracias", slot: 1, createdAt: 11 },
    ]);

    expect(await new JsonFilePhraseRepository(file).list()).toEqual([
      { id: "x", text: "Hola", slot: 0, createdAt: 10 },
      { id: "y", text: "Gracias", slot: 1, createdAt: 11 },
    ]);
    expect(await readdir(dir)).toEqual(["phrases.json"]);
  });

  it("keeps the previous phrases when replacing them fails", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await repository.save({ id: "a", text: "Mine", slot: 0, createdAt: 1 });
    await chmod(dir, 0o555);
    try {
      await expect(repository.replaceAll([{ id: "x", text: "Hola", slot: 0, createdAt: 10 }])).rejects.toThrow();
    } finally {
      await chmod(dir, 0o755);
    }

    expect(await repository.list()).toEqual([{ id: "a", text: "Mine", slot: 0, createdAt: 1 }]);
  });

  it("ignores entries that are not valid phrases", async () => {
    await writeFile(file, JSON.stringify([{ id: "a", text: "Ok", createdAt: 1 }, { id: 2 }, "nope"]), "utf8");

    expect(await new JsonFilePhraseRepository(file).list()).toEqual([{ id: "a", text: "Ok", slot: 0, createdAt: 1 }]);
  });

  it("gives old phrases without a slot the lowest free slots and persists them on the next write", async () => {
    await writeFile(
      file,
      JSON.stringify([
        { id: "b", text: "Bye", createdAt: 2 },
        { id: "a", text: "Hello", createdAt: 1 },
        { id: "c", text: "Pinned", slot: 0, createdAt: 3 },
      ]),
      "utf8",
    );
    const repository = new JsonFilePhraseRepository(file);

    expect((await repository.list()).map((p) => [p.id, p.slot])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);

    await repository.save({ id: "d", text: "New", slot: 3, createdAt: 4 });
    const stored = JSON.parse(await readFile(file, "utf8")) as Array<{ id: string; slot: number }>;
    expect(stored.map((p) => [p.id, p.slot])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
      ["d", 3],
    ]);
  });

  it("updates an existing phrase and rejects unknown ids", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await repository.save({ id: "a", text: "Hello", slot: 0, createdAt: 1 });

    await repository.update({ id: "a", text: "Hi", slot: 4, createdAt: 1 });
    await expect(repository.update({ id: "zzz", text: "x", slot: 1, createdAt: 1 })).rejects.toBeInstanceOf(PhraseNotFoundError);

    expect(await repository.list()).toEqual([{ id: "a", text: "Hi", slot: 4, createdAt: 1 }]);
  });
});
