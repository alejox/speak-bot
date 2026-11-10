import { describe, expect, it } from "vitest";
import { DEFAULT_PHRASE_TEXTS, DEFAULT_PHRASES_BY_LANGUAGE, UI_LANGUAGES } from "../src";

describe("DEFAULT_PHRASES_BY_LANGUAGE", () => {
  it("has the Spanish set", () => {
    expect(DEFAULT_PHRASES_BY_LANGUAGE.es).toEqual([
      "Hola",
      "Gracias",
      "Sí",
      "No",
      "Por favor",
      "Un momento, por favor",
      "No puedo hablar, pero sí puedo escucharte",
      "¿Me puedes ayudar?",
    ]);
  });

  it("uses DEFAULT_PHRASE_TEXTS as the English set", () => {
    expect(DEFAULT_PHRASES_BY_LANGUAGE.en).toBe(DEFAULT_PHRASE_TEXTS);
  });

  it("has a set of the same size for every interface language", () => {
    for (const language of UI_LANGUAGES) {
      expect(DEFAULT_PHRASES_BY_LANGUAGE[language]).toHaveLength(DEFAULT_PHRASE_TEXTS.length);
    }
  });
});
