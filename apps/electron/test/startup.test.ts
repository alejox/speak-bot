import { describe, expect, it } from "vitest";
import { HIDDEN_FLAG, shouldStartHidden } from "../src/startup";

describe("shouldStartHidden", () => {
  it("starts with the window visible on a normal launch", () => {
    expect(shouldStartHidden(["/opt/speed-deck/speed-deck"], false)).toBe(false);
  });

  it("starts in the tray when launched at login", () => {
    expect(shouldStartHidden(["Speed Deck.exe", HIDDEN_FLAG], false)).toBe(true);
    expect(shouldStartHidden(["Speed Deck"], true)).toBe(true);
  });
});
