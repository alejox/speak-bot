import { describe, expect, it } from "vitest";
import {
  assignMissingSlots,
  createPhrase,
  InvalidPhraseError,
  listPhrases,
  lowestFreeSlot,
  MAX_PHRASE_SLOTS,
  PhraseNotFoundError,
  restoreDefaultPhrases,
  savePhrase,
  seedDefaultPhrases,
  SlotOccupiedError,
  updatePhrase,
} from "../src";
import { InMemoryPhraseRepository, sequentialIds } from "./fakes";

describe("phrase slots", () => {
  it("validates the slot when creating a phrase", () => {
    expect(createPhrase({ id: "p", text: "Hi", slot: 0, createdAt: 1 }).slot).toBe(0);
    for (const slot of [-1, 1.5, Number.NaN, MAX_PHRASE_SLOTS]) {
      expect(() => createPhrase({ id: "p", text: "Hi", slot, createdAt: 1 })).toThrow(InvalidPhraseError);
    }
  });

  it("rejects text longer than 1000 characters and long labels", () => {
    expect(() => createPhrase({ id: "p", text: "x".repeat(1001), slot: 0, createdAt: 1 })).toThrow(InvalidPhraseError);
    expect(() => createPhrase({ id: "p", text: "Hi", label: "x".repeat(101), slot: 0, createdAt: 1 })).toThrow(InvalidPhraseError);
  });

  it("finds the lowest free slot", () => {
    expect(lowestFreeSlot([])).toBe(0);
    expect(lowestFreeSlot([{ slot: 0 }, { slot: 1 }, { slot: 3 }])).toBe(2);
  });

  it("gives phrases without a slot the lowest free slots in creation order, keeping valid slots", () => {
    const normalized = assignMissingSlots([
      { id: "c", text: "C", createdAt: 3 },
      { id: "a", text: "A", createdAt: 1, slot: 1 },
      { id: "b", text: "B", createdAt: 2 },
      { id: "d", text: "D", createdAt: 4, slot: 1 },
    ]);

    expect(normalized.map((phrase) => [phrase.id, phrase.slot])).toEqual([
      ["b", 0],
      ["a", 1],
      ["c", 2],
      ["d", 3],
    ]);
  });

  it("is deterministic and leaves already-slotted lists untouched", () => {
    const phrases = [
      { id: "a", text: "A", createdAt: 1, slot: 4 },
      { id: "b", text: "B", createdAt: 2, slot: 0 },
    ];
    expect(assignMissingSlots(phrases)).toEqual([phrases[1], phrases[0]]);
  });
});

describe("savePhrase with slots", () => {
  it("uses the lowest free slot when none is given", async () => {
    const repository = new InMemoryPhraseRepository([{ id: "a", text: "A", slot: 0, createdAt: 1 }]);

    const phrase = await savePhrase({ repository, generateId: () => "p", now: () => 5 }, { text: "B" });

    expect(phrase.slot).toBe(1);
  });

  it("saves into a free slot and rejects an occupied one with a typed error", async () => {
    const repository = new InMemoryPhraseRepository([{ id: "a", text: "A", slot: 3, createdAt: 1 }]);
    const deps = { repository, generateId: sequentialIds(), now: () => 5 };

    expect((await savePhrase(deps, { text: "B", slot: 7 })).slot).toBe(7);
    const rejected = savePhrase(deps, { text: "C", slot: 3 });
    await expect(rejected).rejects.toBeInstanceOf(SlotOccupiedError);
    await expect(rejected).rejects.toMatchObject({ slot: 3 });
    expect(await repository.list()).toHaveLength(2);
  });
});

describe("updatePhrase", () => {
  const initial = () =>
    new InMemoryPhraseRepository([
      { id: "a", text: "Hello", label: "Hi", slot: 0, createdAt: 1 },
      { id: "b", text: "Bye", slot: 1, createdAt: 2 },
    ]);

  it("changes text and label, keeping id, slot and creation time", async () => {
    const repository = initial();

    const updated = await updatePhrase(repository, "a", { text: " Hello there ", label: "" });

    expect(updated).toEqual({ id: "a", text: "Hello there", slot: 0, createdAt: 1 });
    expect(repository.writes).toEqual(["update"]);
    expect((await listPhrases(repository))[0]).toEqual(updated);
  });

  it("keeps the label when it is not given", async () => {
    const repository = initial();
    expect(await updatePhrase(repository, "a", { text: "Yo" })).toMatchObject({ label: "Hi" });
  });

  it("moves to a free slot but rejects an occupied one", async () => {
    const repository = initial();

    expect((await updatePhrase(repository, "a", { slot: 9 })).slot).toBe(9);
    await expect(updatePhrase(repository, "a", { slot: 1 })).rejects.toBeInstanceOf(SlotOccupiedError);
    expect((await updatePhrase(repository, "b", { slot: 1, text: "Bye now" })).text).toBe("Bye now");
  });

  it("rejects invalid changes and unknown phrases without writing", async () => {
    const repository = initial();

    await expect(updatePhrase(repository, "a", { text: "  " })).rejects.toBeInstanceOf(InvalidPhraseError);
    await expect(updatePhrase(repository, "a", { slot: -2 })).rejects.toBeInstanceOf(InvalidPhraseError);
    await expect(updatePhrase(repository, "zzz", { text: "x" })).rejects.toBeInstanceOf(PhraseNotFoundError);
    expect(repository.writes).toEqual([]);
  });
});

describe("listing, seeding and restoring with slots", () => {
  it("lists phrases in slot order", async () => {
    const repository = new InMemoryPhraseRepository([
      { id: "a", text: "A", slot: 5, createdAt: 1 },
      { id: "b", text: "B", slot: 2, createdAt: 2 },
    ]);
    expect((await listPhrases(repository)).map((phrase) => phrase.id)).toEqual(["b", "a"]);
  });

  it("seeds and restores the defaults into slots 0..n-1", async () => {
    const seeded = new InMemoryPhraseRepository();
    await seedDefaultPhrases({ repository: seeded, generateId: sequentialIds(), now: () => 1 }, ["Hola", "Gracias", "Sí"]);
    expect((await listPhrases(seeded)).map((phrase) => phrase.slot)).toEqual([0, 1, 2]);

    const restored = new InMemoryPhraseRepository([{ id: "x", text: "Mine", slot: 8, createdAt: 1 }]);
    await restoreDefaultPhrases({ repository: restored, generateId: sequentialIds(), now: () => 1 }, ["Hola", "Gracias"]);
    expect((await listPhrases(restored)).map((phrase) => [phrase.text, phrase.slot])).toEqual([
      ["Hola", 0],
      ["Gracias", 1],
    ]);
  });
});
