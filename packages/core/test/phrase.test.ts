import { describe, expect, it } from "vitest";
import { createPhrase, InvalidPhraseError } from "../src/domain/phrase";

describe("createPhrase", () => {
  it("creates a phrase with trimmed text and label", () => {
    const phrase = createPhrase({ id: "p1", text: "  Hello  ", label: "  Greeting ", slot: 0, createdAt: 10 });

    expect(phrase).toEqual({ id: "p1", text: "Hello", label: "Greeting", slot: 0, createdAt: 10 });
  });

  it("omits the label when it is blank", () => {
    const phrase = createPhrase({ id: "p1", text: "Hello", label: "   ", slot: 0, createdAt: 10 });

    expect(phrase).not.toHaveProperty("label");
  });

  it.each(["", "   ", "\n\t"])("rejects empty text %j", (text) => {
    expect(() => createPhrase({ id: "p1", text, slot: 0, createdAt: 10 })).toThrow(InvalidPhraseError);
  });

  it("rejects an empty id", () => {
    expect(() => createPhrase({ id: " ", text: "Hello", slot: 0, createdAt: 10 })).toThrow(InvalidPhraseError);
  });
});
