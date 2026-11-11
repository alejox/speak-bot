import { describe, expect, it } from "vitest";
import {
  ACTION_CATEGORIES,
  ACTION_REGISTRY,
  applicationNameOf,
  InvalidBoardError,
  isActionAllowedOnBoard,
  MAX_APPLICATION_ID_LENGTH,
  parseAction,
} from "../src";

describe("system.openApp", () => {
  it("is a system action with one application parameter that only the desktop runs", () => {
    const definition = ACTION_REGISTRY["system.openApp"];
    expect(definition).toMatchObject({ category: "system", runsOn: "server", requiresDesktop: true, requiresObs: false });
    expect(definition.params.map((param) => [param.name, param.kind, param.maxLength])).toEqual([["appId", "application", MAX_APPLICATION_ID_LENGTH]]);
    expect(ACTION_CATEGORIES).toContain("system");
  });

  it("belongs on Deck boards only", () => {
    expect(isActionAllowedOnBoard("deck", "system.openApp")).toBe(true);
    expect(isActionAllowedOnBoard("voice", "system.openApp")).toBe(false);
  });

  it("keeps the application id verbatim and drops anything else", () => {
    expect(parseAction({ type: "system.openApp", appId: "/Applications/DaVinci Resolve/DaVinci Resolve.app", args: ["--evil"] })).toEqual({
      type: "system.openApp",
      appId: "/Applications/DaVinci Resolve/DaVinci Resolve.app",
    });
  });

  it.each([undefined, "", "   ", 7, ["/Applications/A.app"], "x".repeat(MAX_APPLICATION_ID_LENGTH + 1)])("rejects the application id %j", (appId) => {
    expect(() => parseAction({ type: "system.openApp", appId })).toThrow(InvalidBoardError);
  });

  it("names an application after its bundle", () => {
    expect(applicationNameOf("/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app")).toBe("Adobe Photoshop 2025");
    expect(applicationNameOf("C:\\Apps\\Tool.exe")).toBe("Tool.exe");
    expect(applicationNameOf("Notes")).toBe("Notes");
  });
});
