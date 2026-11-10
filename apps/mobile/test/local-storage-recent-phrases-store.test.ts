import { describe, expect, it } from "vitest";
import { LocalStorageRecentPhrasesStore, MAX_RECENT_PHRASES, RECENT_PHRASES_STORAGE_KEY } from "../src/adapters/local-storage-recent-phrases-store";

const store = () => new LocalStorageRecentPhrasesStore(localStorage);

describe("LocalStorageRecentPhrasesStore", () => {
  it("is empty on a new device", () => {
    expect(store().load()).toEqual([]);
  });

  it("keeps the most recent phrase first and survives a reload", () => {
    const recent = store();
    recent.add("Hello");
    expect(recent.add("Thank you")).toEqual(["Thank you", "Hello"]);
    expect(store().load()).toEqual(["Thank you", "Hello"]);
  });

  it("keeps each text once, moving a repeated one to the front", () => {
    const recent = store();
    recent.add("One");
    recent.add("Two");
    expect(recent.add("  One  ")).toEqual(["One", "Two"]);
  });

  it("ignores empty text", () => {
    const recent = store();
    recent.add("One");
    expect(recent.add("   ")).toEqual(["One"]);
  });

  it(`keeps the last ${MAX_RECENT_PHRASES} phrases`, () => {
    const recent = store();
    for (let number = 1; number <= 10; number += 1) recent.add(`Phrase ${number}`);
    expect(recent.load()).toEqual(["Phrase 10", "Phrase 9", "Phrase 8", "Phrase 7", "Phrase 6", "Phrase 5", "Phrase 4", "Phrase 3"]);
  });

  it("forgets everything when cleared", () => {
    const recent = store();
    recent.add("One");
    recent.clear();
    expect(recent.load()).toEqual([]);
    expect(store().load()).toEqual([]);
  });

  it("reads invalid stored data as an empty or cleaned list", () => {
    localStorage.setItem(RECENT_PHRASES_STORAGE_KEY, "{not json");
    expect(store().load()).toEqual([]);
    localStorage.setItem(RECENT_PHRASES_STORAGE_KEY, JSON.stringify({ phrases: ["One"] }));
    expect(store().load()).toEqual([]);
    localStorage.setItem(RECENT_PHRASES_STORAGE_KEY, JSON.stringify(["One", 7, "", "  ", null, "One", "Two", ...Array.from({ length: 12 }, (_, index) => `Extra ${index}`)]));
    expect(store().load()).toEqual(["One", "Two", "Extra 0", "Extra 1", "Extra 2", "Extra 3", "Extra 4", "Extra 5"]);
  });

  it("works without storage, for this visit only", () => {
    const recent = new LocalStorageRecentPhrasesStore(null);
    expect(recent.add("One")).toEqual(["One"]);
    expect(recent.load()).toEqual(["One"]);
  });
});
