import { describe, expect, it } from "vitest";
import { createPhrase, InvalidPhraseError } from "../src/domain/phrase";

describe("createPhrase", () => {
  it("creates a phrase with trimmed text and label", () => {
    const phrase = createPhrase({ id: "p1", text: "  Hello  ", label: "  Greeting ", createdAt: 10 });

    expect(phrase).toEqual({ id: "p1", text: "Hello", label: "Greeting", createdAt: 10 });
  });

  it("omits the label when it is blank", () => {
    const phrase = createPhrase({ id: "p1", text: "Hello", label: "   ", createdAt: 10 });

    expect(phrase).not.toHaveProperty("label");
  });

  it.each(["", "   ", "\n\t"])("rejects empty text %j", (text) => {
    expect(() => createPhrase({ id: "p1", text, createdAt: 10 })).toThrow(InvalidPhraseError);
  });

  it("rejects an empty id", () => {
    expect(() => createPhrase({ id: " ", text: "Hello", createdAt: 10 })).toThrow(InvalidPhraseError);
  });
});
