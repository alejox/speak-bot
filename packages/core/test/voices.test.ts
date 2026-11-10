import { describe, expect, it } from "vitest";
import { languageOfTag, pickVoiceForLanguage, type Voice } from "../src";

const voice = (id: string, lang: string, isDefault = false): Voice => ({ id, name: id, lang, isDefault });

describe("languageOfTag", () => {
  it("normalizes Web Speech, macOS and espeak tags to the primary language", () => {
    expect(languageOfTag("es-ES")).toBe("es");
    expect(languageOfTag("es_MX")).toBe("es");
    expect(languageOfTag("EN-us")).toBe("en");
    expect(languageOfTag("en")).toBe("en");
    expect(languageOfTag("  ")).toBe("");
  });
});

describe("pickVoiceForLanguage", () => {
  it("picks the first voice whose language matches", () => {
    const voices = [voice("Alex", "en-US"), voice("Monica", "es_ES"), voice("Paulina", "es-MX")];
    expect(pickVoiceForLanguage(voices, "es")?.id).toBe("Monica");
    expect(pickVoiceForLanguage(voices, "en")?.id).toBe("Alex");
  });

  it("prefers the system default among matching voices", () => {
    const voices = [voice("Monica", "es-ES"), voice("Paulina", "es-MX", true)];
    expect(pickVoiceForLanguage(voices, "es")?.id).toBe("Paulina");
  });

  it("does not match a language that only shares a prefix", () => {
    expect(pickVoiceForLanguage([voice("Estonian", "et-EE"), voice("Esperanto", "eo")], "es")).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(pickVoiceForLanguage([voice("Alex", "en-US")], "es")).toBeUndefined();
    expect(pickVoiceForLanguage([], "es")).toBeUndefined();
  });
});
