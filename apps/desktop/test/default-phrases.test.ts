import { describe, expect, it } from "vitest";
import { DEFAULT_PHRASES } from "../src/default-phrases";

describe("DEFAULT_PHRASES", () => {
  it("has the Spanish set", () => {
    expect(DEFAULT_PHRASES.es).toEqual([
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

  it("has an English set of the same size", () => {
    expect(DEFAULT_PHRASES.en).toContain("I can't speak but I can hear you");
    expect(DEFAULT_PHRASES.en).toHaveLength(DEFAULT_PHRASES.es.length);
  });
});
