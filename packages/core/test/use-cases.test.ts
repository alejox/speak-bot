import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHRASE_TEXTS,
  deletePhrase,
  EmptyTextError,
  InvalidPhraseError,
  listPhrases,
  restoreDefaultPhrases,
  savePhrase,
  seedDefaultPhrases,
  speakText,
  stopSpeaking,
} from "../src";
import { FakeSpeechSynthesizer, InMemoryPhraseRepository, sequentialIds } from "./fakes";

describe("speakText", () => {
  it("speaks trimmed text with the given options", async () => {
    const synthesizer = new FakeSpeechSynthesizer();

    await speakText(synthesizer, "  Hello there ", { voiceId: "v1", rate: 1.2 });

    expect(synthesizer.spoken).toEqual([{ text: "Hello there", options: { voiceId: "v1", rate: 1.2 } }]);
  });

  it.each(["", "   ", "\n"])("rejects empty text %j without speaking", async (text) => {
    const synthesizer = new FakeSpeechSynthesizer();

    await expect(speakText(synthesizer, text)).rejects.toBeInstanceOf(EmptyTextError);
    expect(synthesizer.spoken).toHaveLength(0);
  });
});

describe("stopSpeaking", () => {
  it("cancels the current speech", () => {
    const synthesizer = new FakeSpeechSynthesizer();

    stopSpeaking(synthesizer);

    expect(synthesizer.cancelCount).toBe(1);
  });
});

describe("savePhrase", () => {
  it("creates and persists a phrase", async () => {
    const repository = new InMemoryPhraseRepository();

    const phrase = await savePhrase(
      { repository, generateId: () => "p1", now: () => 42 },
      { text: " I need help ", label: "Help" },
    );

    expect(phrase).toEqual({ id: "p1", text: "I need help", label: "Help", slot: 0, createdAt: 42 });
    expect(await repository.list()).toEqual([phrase]);
  });

  it("rejects invalid text without persisting", async () => {
    const repository = new InMemoryPhraseRepository();

    await expect(
      savePhrase({ repository, generateId: () => "p1", now: () => 42 }, { text: "  " }),
    ).rejects.toBeInstanceOf(InvalidPhraseError);
    expect(await repository.list()).toEqual([]);
  });
});

describe("listPhrases", () => {
  it("returns phrases in deck (slot) order", async () => {
    const repository = new InMemoryPhraseRepository([
      { id: "b", text: "Second", slot: 1, createdAt: 1 },
      { id: "a", text: "First", slot: 0, createdAt: 2 },
    ]);

    const phrases = await listPhrases(repository);

    expect(phrases.map((phrase) => phrase.id)).toEqual(["a", "b"]);
  });
});

describe("deletePhrase", () => {
  it("removes the phrase by id", async () => {
    const repository = new InMemoryPhraseRepository([
      { id: "a", text: "First", slot: 0, createdAt: 1 },
      { id: "b", text: "Second", slot: 1, createdAt: 2 },
    ]);

    await deletePhrase(repository, "a");

    expect((await repository.list()).map((phrase) => phrase.id)).toEqual(["b"]);
  });
});

describe("seedDefaultPhrases", () => {
  it("saves the default phrases when the repository is empty", async () => {
    const repository = new InMemoryPhraseRepository();

    const seeded = await seedDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 });

    expect(seeded.map((phrase) => phrase.text)).toEqual([...DEFAULT_PHRASE_TEXTS]);
    expect((await listPhrases(repository)).map((phrase) => phrase.text)).toEqual([...DEFAULT_PHRASE_TEXTS]);
  });

  it("keeps the default order stable even with an identical clock", async () => {
    const repository = new InMemoryPhraseRepository();

    await seedDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 });
    const createdAt = (await listPhrases(repository)).map((phrase) => phrase.createdAt);

    expect(new Set(createdAt).size).toBe(DEFAULT_PHRASE_TEXTS.length);
  });

  it("does nothing when phrases already exist", async () => {
    const existing = { id: "x", text: "Mine", slot: 0, createdAt: 1 };
    const repository = new InMemoryPhraseRepository([existing]);

    const seeded = await seedDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 });

    expect(seeded).toEqual([]);
    expect(await repository.list()).toEqual([existing]);
  });

  it("seeds the given localized texts in order", async () => {
    const repository = new InMemoryPhraseRepository();
    const texts = ["Hola", "Gracias", "¿Me puedes ayudar?"];

    const seeded = await seedDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 }, texts);

    expect(seeded.map((phrase) => phrase.text)).toEqual(texts);
    expect((await listPhrases(repository)).map((phrase) => phrase.text)).toEqual(texts);
  });

  it("includes the essential phrases", () => {
    expect(DEFAULT_PHRASE_TEXTS).toEqual(
      expect.arrayContaining(["Hello", "Thank you", "Yes", "No", "One moment please", "I can't speak but I can hear you"]),
    );
  });
});

describe("restoreDefaultPhrases", () => {
  it("replaces every saved phrase with the given defaults, in order", async () => {
    const repository = new InMemoryPhraseRepository([
      { id: "a", text: "Mine", slot: 0, createdAt: 1 },
      { id: "b", text: "Hola", slot: 1, createdAt: 2 },
    ]);

    const restored = await restoreDefaultPhrases(
      { repository, generateId: sequentialIds(), now: () => 100 },
      ["Hola", "Gracias"],
    );

    expect(restored.map((phrase) => phrase.text)).toEqual(["Hola", "Gracias"]);
    expect((await listPhrases(repository)).map((phrase) => phrase.text)).toEqual(["Hola", "Gracias"]);
    expect((await repository.list()).some((phrase) => phrase.id === "a" || phrase.id === "b")).toBe(false);
  });

  it("works on an empty repository", async () => {
    const repository = new InMemoryPhraseRepository();

    await restoreDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 }, ["Hello"]);

    expect((await repository.list()).map((phrase) => phrase.text)).toEqual(["Hello"]);
  });

  it("replaces the whole list in a single write", async () => {
    const repository = new InMemoryPhraseRepository([{ id: "a", text: "Mine", slot: 0, createdAt: 1 }]);

    await restoreDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 }, ["Hola", "Gracias"]);

    expect(repository.writes).toEqual(["replaceAll"]);
  });

  it("ends with exactly the defaults when two restores run at the same time", async () => {
    const repository = new InMemoryPhraseRepository([{ id: "a", text: "Mine", slot: 0, createdAt: 1 }]);
    const deps = { repository, generateId: sequentialIds(), now: () => 100 };

    await Promise.all([restoreDefaultPhrases(deps, ["Hola", "Gracias"]), restoreDefaultPhrases(deps, ["Hola", "Gracias"])]);

    expect((await listPhrases(repository)).map((phrase) => phrase.text)).toEqual(["Hola", "Gracias"]);
  });

  it("keeps the previous phrases when the write fails", async () => {
    const repository = new InMemoryPhraseRepository([{ id: "a", text: "Mine", slot: 0, createdAt: 1 }]);
    repository.failReplaceAll = new Error("disk full");

    await expect(
      restoreDefaultPhrases({ repository, generateId: sequentialIds(), now: () => 100 }, ["Hola", "Gracias"]),
    ).rejects.toThrow("disk full");

    expect(await repository.list()).toEqual([{ id: "a", text: "Mine", slot: 0, createdAt: 1 }]);
  });
});
