import { describe, expect, it } from "vitest";
import { isDataRecoveryNotice, isServerEvent } from "../src/protocol";

describe("data recovery in the protocol", () => {
  const notice = { file: "boards", outcome: "restored", at: 1_700_000_000_000, damagedCopyPath: "/data/boards.json.corrupt-2026-11-14T10-00-00.000Z" };

  it("accepts the notice a computer reports for its boards file", () => {
    expect(isDataRecoveryNotice(notice)).toBe(true);
    expect(isDataRecoveryNotice({ ...notice, outcome: "defaults" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDataRecoveryNotice(null)).toBe(false);
    expect(isDataRecoveryNotice({ ...notice, outcome: "lost" })).toBe(false);
    expect(isDataRecoveryNotice({ ...notice, file: "settings" })).toBe(false);
    expect(isDataRecoveryNotice({ ...notice, damagedCopyPath: 5 })).toBe(false);
    expect(isDataRecoveryNotice({ ...notice, at: "now" })).toBe(false);
  });

  it("knows the event that tells clients to ask again", () => {
    expect(isServerEvent({ type: "data-recovery", at: 1 })).toBe(true);
    expect(isServerEvent({ type: "data-recovery" })).toBe(false);
  });
});
