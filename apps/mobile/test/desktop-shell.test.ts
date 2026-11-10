import { describe, expect, it } from "vitest";
import { isDesktopShell } from "../src/app/desktop-shell";

describe("isDesktopShell", () => {
  it("recognises the Speed Deck desktop app window (Electron)", () => {
    const electron =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) speed-deck/0.0.0 Chrome/140.0.0.0 Electron/45.2.3 Safari/537.36";
    expect(isDesktopShell(electron)).toBe(true);
  });

  it("is false in a regular browser or on a phone", () => {
    expect(
      isDesktopShell(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isDesktopShell(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });
});
