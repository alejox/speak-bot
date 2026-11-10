import { PhraseNotFoundError, type Phrase } from "@speed-deck/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LocalStoragePhraseRepository,
  PHRASES_STORAGE_KEY,
} from "../src/adapters/local-storage-phrase-repository";

const hello: Phrase = { id: "a", text: "Hello", slot: 0, createdAt: 1 };
const thanks: Phrase = { id: "b", text: "Thank you", label: "Thanks", slot: 1, createdAt: 2 };

describe("LocalStoragePhraseRepository", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty and uninitialized", async () => {
    const repository = new LocalStoragePhraseRepository(localStorage);

    expect(await repository.list()).toEqual([]);
    expect(repository.isInitialized()).toBe(false);
  });

  it("persists phrases across instances", async () => {
    await new LocalStoragePhraseRepository(localStorage).save(hello);
    await new LocalStoragePhraseRepository(localStorage).save(thanks);

    const repository = new LocalStoragePhraseRepository(localStorage);
    expect(await repository.list()).toEqual([hello, thanks]);
    expect(repository.isInitialized()).toBe(true);
  });

  it("replaces a phrase saved with the same id", async () => {
    const repository = new LocalStoragePhraseRepository(localStorage);

    await repository.save(hello);
    await repository.save({ ...hello, text: "Hi" });

    expect(await repository.list()).toEqual([{ ...hello, text: "Hi" }]);
  });

  it("deletes phrases and stays initialized when emptied", async () => {
    const repository = new LocalStoragePhraseRepository(localStorage);
    await repository.save(hello);

    await repository.delete("a");

    expect(await repository.list()).toEqual([]);
    expect(repository.isInitialized()).toBe(true);
  });

  it("replaces every phrase with a single storage write", async () => {
    await new LocalStoragePhraseRepository(localStorage).save(hello);
    const writes: string[] = [];
    const countingStorage = {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: (key: string, value: string) => {
        writes.push(key);
        localStorage.setItem(key, value);
      },
    } as unknown as Storage;

    await new LocalStoragePhraseRepository(countingStorage).replaceAll([thanks]);

    expect(writes).toEqual([PHRASES_STORAGE_KEY]);
    expect(await new LocalStoragePhraseRepository(localStorage).list()).toEqual([thanks]);
  });

  it("treats corrupt JSON as an empty list", async () => {
    localStorage.setItem(PHRASES_STORAGE_KEY, "{not json");

    expect(await new LocalStoragePhraseRepository(localStorage).list()).toEqual([]);
  });

  it("drops entries that are not valid phrases", async () => {
    localStorage.setItem(
      PHRASES_STORAGE_KEY,
      JSON.stringify([hello, { id: 1, text: "bad" }, { id: "c", text: "  ", createdAt: 3 }, null, "x"]),
    );

    expect(await new LocalStoragePhraseRepository(localStorage).list()).toEqual([hello]);
  });

  it("ignores stored data that is not an array", async () => {
    localStorage.setItem(PHRASES_STORAGE_KEY, JSON.stringify({ id: "a" }));

    expect(await new LocalStoragePhraseRepository(localStorage).list()).toEqual([]);
  });

  it("works in memory when storage is unavailable", async () => {
    const repository = new LocalStoragePhraseRepository(null);

    await repository.save(hello);

    expect(await repository.list()).toEqual([hello]);
  });

  it("falls back to memory when writing fails", async () => {
    const failingStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as unknown as Storage;
    const repository = new LocalStoragePhraseRepository(failingStorage);

    await repository.save(hello);
    await repository.save(thanks);

    expect(await repository.list()).toEqual([hello, thanks]);
  });

  it("gives old phrases without a slot the lowest free slots and stores them on the next write", async () => {
    localStorage.setItem(
      PHRASES_STORAGE_KEY,
      JSON.stringify([
        { id: "b", text: "Bye", createdAt: 2 },
        { id: "a", text: "Hello", createdAt: 1 },
      ]),
    );
    const repository = new LocalStoragePhraseRepository(localStorage);

    expect((await repository.list()).map((p) => [p.id, p.slot])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    await repository.delete("zzz");
    expect(JSON.parse(localStorage.getItem(PHRASES_STORAGE_KEY) ?? "[]")).toEqual([
      { id: "a", text: "Hello", slot: 0, createdAt: 1 },
      { id: "b", text: "Bye", slot: 1, createdAt: 2 },
    ]);
  });

  it("updates an existing phrase and rejects unknown ids", async () => {
    const repository = new LocalStoragePhraseRepository(localStorage);
    await repository.save(hello);

    await repository.update({ ...hello, text: "Hi", slot: 3 });
    await expect(repository.update({ ...thanks, id: "zzz" })).rejects.toBeInstanceOf(PhraseNotFoundError);

    expect(await repository.list()).toEqual([{ ...hello, text: "Hi", slot: 3 }]);
  });
});
