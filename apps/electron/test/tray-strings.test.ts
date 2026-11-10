import { describe, expect, it } from "vitest";
import { TRAY_STRINGS, trayStrings } from "../src/tray-strings";

describe("trayStrings", () => {
  it("is Spanish by default", () => {
    expect(trayStrings(undefined).open).toBe("Abrir Speed Deck");
    expect(trayStrings("es").quit).toBe("Salir de Speed Deck");
  });

  it("follows the language saved in the desktop settings", () => {
    expect(trayStrings("en").open).toBe("Open Speed Deck");
    expect(trayStrings("en").startAtLogin).toBe("Start at login");
    expect(trayStrings("en").copyObsDockUrl).toBe("Copy OBS dock URL");
    expect(trayStrings("es").copyObsDockUrl).toBe("Copiar URL del dock de OBS");
  });

  it("falls back to Spanish for unknown languages", () => {
    expect(trayStrings("fr")).toEqual(TRAY_STRINGS.es);
  });

  it("has the same entries in every language", () => {
    expect(Object.keys(TRAY_STRINGS.en).sort()).toEqual(Object.keys(TRAY_STRINGS.es).sort());
  });
});
