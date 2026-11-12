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
      { type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false, hiddenSources: [{ sceneName: "Main", sourceName: "Cam" }] }, at: 14 },
      { type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false, monitoredInputs: ["Mic"] }, at: 14 },
      { type: "settings-changed", settings: { voiceId: "", rate: 1, deviceId: "", language: "en", captionsVisible: true }, at: 15 },
      { type: "ads-changed", ads: { adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 3 } }, at: 16 },
      { type: "ads-changed", ads: { adsFree: false }, at: 17 },
    ];
    for (const event of events) expect(isServerEvent(event)).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isServerEvent(null)).toBe(false);
    expect(isServerEvent("caption")).toBe(false);
    expect(isServerEvent({ type: "caption", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "ads-changed", at: 1 })).toBe(false);
    expect(isServerEvent({ type: "ads-changed", ads: { adsFree: "yes" }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "ads-changed", ads: { adsFree: true, grantedBy: { deviceName: 5, grantedAt: 3 } }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "license-changed", license: { adsFree: true, canActivate: true }, at: 1 })).toBe(false);
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
    expect(isServerEvent({ type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false, hiddenSources: [{ sceneName: "Main" }] }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false, hiddenSources: "Cam" }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false, monitoredInputs: [3] }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "obs-state", state: { currentScene: null, mutedInputs: [], streaming: false, recording: false, monitoredInputs: "Mic" }, at: 1 })).toBe(false);
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

describe("voice output", () => {
  it("knows the three outputs and defaults to the speakers", async () => {
    const { VOICE_OUTPUTS, DEFAULT_VOICE_OUTPUT, isVoiceOutput } = await import("../src/protocol");
    expect(VOICE_OUTPUTS).toEqual(["speakers", "obs", "both"]);
    expect(DEFAULT_VOICE_OUTPUT).toBe("speakers");
    for (const output of VOICE_OUTPUTS) expect(isVoiceOutput(output)).toBe(true);
    for (const value of ["", "OBS", "virtual", 1, null, undefined]) expect(isVoiceOutput(value)).toBe(false);
  });

  it("accepts the overlay-audio event and rejects a malformed one", () => {
    expect(isServerEvent({ type: "overlay-audio", connected: true, at: 1 })).toBe(true);
    expect(isServerEvent({ type: "overlay-audio", connected: "yes", at: 1 })).toBe(false);
  });

  it("reads overlay clip reports and rejects anything else", async () => {
    const { isOverlayClipReport } = await import("../src/protocol");
    const id = "0123456789abcdef0123456789abcdef";
    for (const type of ["clip-started", "clip-ended", "clip-failed"]) expect(isOverlayClipReport({ type, id })).toBe(true);
    expect(isOverlayClipReport({ type: "clip-ended" })).toBe(false);
    expect(isOverlayClipReport({ type: "clip-paused", id })).toBe(false);
    expect(isOverlayClipReport({ type: "clip-ended", id: "../../etc" })).toBe(false);
    expect(isOverlayClipReport(null)).toBe(false);
  });
});

describe("parseAdsPurchaseReport", () => {
  const report = { deviceId: "device-pixel-0001", deviceName: "Pixel 8", entitlement: "owned" };

  it("accepts a report, trimming the name and dropping unknown fields", async () => {
    const { parseAdsPurchaseReport } = await import("../src/protocol");
    expect(parseAdsPurchaseReport({ ...report, deviceName: "  Pixel 8 ", extra: 1 })).toEqual(report);
    for (const entitlement of ["unknown", "not-owned", "pending", "owned"]) {
      expect(parseAdsPurchaseReport({ ...report, entitlement })).toEqual({ ...report, entitlement });
    }
  });

  it("rejects anything that is not a bounded id, a bounded name and a known entitlement", async () => {
    const { parseAdsPurchaseReport, MAX_ADS_DEVICE_ID_LENGTH, MAX_ADS_DEVICE_NAME_LENGTH } = await import("../src/protocol");
    const invalid: unknown[] = [
      null,
      "owned",
      [],
      { ...report, deviceId: "short" },
      { ...report, deviceId: "with space 0001" },
      { ...report, deviceId: "x".repeat(MAX_ADS_DEVICE_ID_LENGTH + 1) },
      { ...report, deviceId: 12345678 },
      { ...report, deviceName: "" },
      { ...report, deviceName: "line\nbreak" },
      { ...report, deviceName: "n".repeat(MAX_ADS_DEVICE_NAME_LENGTH + 1) },
      { ...report, entitlement: "gold" },
    ];
    for (const value of invalid) expect(parseAdsPurchaseReport(value)).toBeNull();
  });
});
