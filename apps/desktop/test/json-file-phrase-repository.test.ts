import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    await repository.save({ id: "a", text: "Hello", createdAt: 1 });
    await repository.save({ id: "b", text: "Bye", createdAt: 2 });
    await repository.save({ id: "a", text: "Hello there", createdAt: 1 });
    await repository.delete("b");

    const reopened = new JsonFilePhraseRepository(file);
    expect(await reopened.exists()).toBe(true);
    expect(await reopened.list()).toEqual([{ id: "a", text: "Hello there", createdAt: 1 }]);
  });

  it("writes atomically without leaving temporary files behind", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await Promise.all([1, 2, 3, 4, 5].map((n) => repository.save({ id: `p${n}`, text: `Phrase ${n}`, createdAt: n })));

    expect(await readdir(dir)).toEqual(["phrases.json"]);
    expect((await repository.list()).map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("starts empty and keeps a .bak copy when the file is corrupt", async () => {
    await writeFile(file, "{ not json", "utf8");
    const repository = new JsonFilePhraseRepository(file);

    expect(await repository.list()).toEqual([]);
    expect(await readFile(`${file}.bak`, "utf8")).toBe("{ not json");

    await repository.save({ id: "a", text: "Hello", createdAt: 1 });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual([{ id: "a", text: "Hello", createdAt: 1 }]);
  });

  it("replaces every phrase in one write", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await repository.save({ id: "a", text: "Mine", createdAt: 1 });

    await repository.replaceAll([
      { id: "x", text: "Hola", createdAt: 10 },
      { id: "y", text: "Gracias", createdAt: 11 },
    ]);

    expect(await new JsonFilePhraseRepository(file).list()).toEqual([
      { id: "x", text: "Hola", createdAt: 10 },
      { id: "y", text: "Gracias", createdAt: 11 },
    ]);
    expect(await readdir(dir)).toEqual(["phrases.json"]);
  });

  it("keeps the previous phrases when replacing them fails", async () => {
    const repository = new JsonFilePhraseRepository(file);
    await repository.save({ id: "a", text: "Mine", createdAt: 1 });
    await chmod(dir, 0o555);
    try {
      await expect(repository.replaceAll([{ id: "x", text: "Hola", createdAt: 10 }])).rejects.toThrow();
    } finally {
      await chmod(dir, 0o755);
    }

    expect(await repository.list()).toEqual([{ id: "a", text: "Mine", createdAt: 1 }]);
  });

  it("ignores entries that are not valid phrases", async () => {
    await writeFile(file, JSON.stringify([{ id: "a", text: "Ok", createdAt: 1 }, { id: 2 }, "nope"]), "utf8");

    expect(await new JsonFilePhraseRepository(file).list()).toEqual([{ id: "a", text: "Ok", createdAt: 1 }]);
  });
});
