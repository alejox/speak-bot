import { describe, expect, it } from "vitest";
import { isServerEvent, MAX_SPEAK_TEXT_LENGTH, type ServerEvent } from "../src/protocol";

describe("isServerEvent", () => {
  it("accepts every known event shape", () => {
    const events: ServerEvent[] = [
      { type: "caption", text: "Hello", at: 1 },
      { type: "caption", text: "Hello", phraseId: "p1", at: 1 },
      { type: "speaking", state: "start", at: 2 },
      { type: "speaking", state: "end", at: 3 },
      { type: "phrases-changed", at: 4 },
      { type: "speak-error", message: "espeak-ng is not installed", at: 5 },
    ];
    for (const event of events) expect(isServerEvent(event)).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isServerEvent(null)).toBe(false);
    expect(isServerEvent("caption")).toBe(false);
    expect(isServerEvent({ type: "caption", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "speaking", state: "paused", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "unknown", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "phrases-changed" })).toBe(false);
    expect(isServerEvent({ type: "speak-error", at: 1 })).toBe(false);
  });

  it("exposes the maximum speakable text length", () => {
    expect(MAX_SPEAK_TEXT_LENGTH).toBe(1000);
  });
});
