import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_LANGUAGE,
  isServerEvent,
  isUiLanguage,
  MAX_SPEAK_TEXT_LENGTH,
  UI_LANGUAGES,
  voiceLanguageOf,
  type ServerEvent,
} from "../src/protocol";

describe("isServerEvent", () => {
  it("accepts every known event shape", () => {
    const events: ServerEvent[] = [
      { type: "caption", text: "Hello", at: 1 },
      { type: "caption", text: "Hello", at: 1 },
      { type: "speaking", state: "start", at: 2 },
      { type: "speaking", state: "end", at: 3 },
      { type: "boards-changed", at: 4 },
      { type: "speak-error", message: "espeak-ng is not installed", at: 5 },
      { type: "speak-error", message: "espeak-ng is not installed", code: "engine-unavailable", at: 6 },
      { type: "speak-error", message: "exit code 1", code: "speech-failed", at: 7 },
      { type: "caption-clear", at: 8 },
      { type: "captions-visibility", visible: false, at: 9 },
      { type: "captions-visibility", visible: true, at: 10 },
      { type: "composing", composing: true, at: 10 },
      { type: "composing", composing: false, at: 10 },
      { type: "obs-status", status: "connected", at: 11 },
      { type: "obs-status", status: "error", code: "connection-lost", at: 12 },
      { type: "obs-state", state: { currentScene: "Main", mutedInputs: ["Mic"], streaming: true, recording: false }, at: 13 },
      { type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false }, at: 14 },
      { type: "settings-changed", settings: { voiceId: "", rate: 1, deviceId: "", language: "en", captionsVisible: true }, at: 15 },
      { type: "license-changed", license: { adsFree: true, canActivate: true, maskedKey: "••••4D51", lastValidatedAt: 3 }, at: 16 },
      { type: "license-changed", license: { adsFree: false, canActivate: false }, at: 17 },
    ];
    for (const event of events) expect(isServerEvent(event)).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isServerEvent(null)).toBe(false);
    expect(isServerEvent("caption")).toBe(false);
    expect(isServerEvent({ type: "caption", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "license-changed", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "license-changed", license: { adsFree: "yes", canActivate: true }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "speaking", state: "paused", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "unknown", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "boards-changed" })).toBe(false);
    expect(isServerEvent({ type: "speak-error", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "speak-error", message: "x", code: 3, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "caption-clear" })).toBe(false);
    expect(isServerEvent({ type: "captions-visibility", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "obs-status", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "settings-changed", settings: { language: "fr" }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "settings-changed", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "obs-state", state: { currentScene: 1, mutedInputs: [], streaming: false, recording: false }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "obs-state", state: { currentScene: null, mutedInputs: [2], streaming: false, recording: false }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "captions-visibility", visible: "no", at: 1 })).toBe(false);
  });

  it("exposes the maximum speakable text length", () => {
    expect(MAX_SPEAK_TEXT_LENGTH).toBe(1000);
  });
});

describe("UI languages", () => {
  it("supports Spanish (default) and English", () => {
    expect(UI_LANGUAGES).toEqual(["es", "en"]);
    expect(DEFAULT_UI_LANGUAGE).toBe("es");
  });

  it("recognises only supported language codes", () => {
    expect(isUiLanguage("es")).toBe(true);
    expect(isUiLanguage("en")).toBe(true);
    expect(isUiLanguage("fr")).toBe(false);
    expect(isUiLanguage("ES")).toBe(false);
    expect(isUiLanguage(undefined)).toBe(false);
  });
});

describe("voiceLanguageOf", () => {
  it("uses the chosen voice language, or the interface language when none was chosen", () => {
    expect(voiceLanguageOf({ language: "es" })).toBe("es");
    expect(voiceLanguageOf({ language: "es", voiceLanguage: "en" })).toBe("en");
  });
});
