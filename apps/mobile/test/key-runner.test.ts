import type { Action } from "@speed-deck/core";
import { describe, expect, it, vi } from "vitest";
import { createKeyRunner, type KeyRunnerOptions } from "../src/app/use-key-runner";
import type { Message } from "../src/i18n/messages";

/*
 * Voice boards no longer draw Stop, Repeat, caption or language keys, but keys stored with them (and stored
 * caption keys on Deck boards) still run: the runner keeps handling them.
 */
function runner(target: Partial<KeyRunnerOptions["target"]> = {}) {
  const reports: (Message | null)[] = [];
  const speech = { speak: vi.fn(), stop: vi.fn(), repeat: vi.fn() };
  const setVoiceLanguage = vi.fn();
  const run = createKeyRunner({
    target: { executeAction: null, speaksOnComputer: false, noteDesktopSettings: vi.fn(), setVoiceLanguage, ...target },
    speech,
    voiceLanguage: "en",
    navigate: vi.fn(),
    report: (message) => reports.push(message),
  });
  return { run, reports, speech, setVoiceLanguage };
}

describe("the key runner on this device", () => {
  it("stops, repeats and switches the voice language", () => {
    const { run, reports, speech, setVoiceLanguage } = runner();
    run({ type: "voice.repeat" });
    run({ type: "voice.stop" });
    run({ type: "voice.toggleLanguage" });
    expect(speech.repeat).toHaveBeenCalledTimes(1);
    expect(speech.stop).toHaveBeenCalledTimes(1);
    expect(setVoiceLanguage).toHaveBeenCalledWith("es");
    expect(reports).toEqual([{ key: "actions.stopped" }, { key: "actions.voiceChanged", params: { language: "Español" } }]);
  });

  it("says a caption key needs the computer", () => {
    const { run, reports } = runner();
    run({ type: "captions.clear" });
    expect(reports).toEqual([{ key: "key.needsComputer" }]);
  });
});

describe("the key runner with the computer", () => {
  it("notes the caption and voice language the desktop reports", async () => {
    const noteDesktopSettings = vi.fn();
    const results: Record<string, object> = { "captions.toggle": { ok: true, captionsVisible: false }, "voice.toggleLanguage": { ok: true, voiceLanguage: "es" } };
    const executeAction = vi.fn(async (action: Action) => results[action.type] ?? { ok: true });
    const { run, reports } = runner({ executeAction: executeAction as never, speaksOnComputer: true, noteDesktopSettings });
    run({ type: "captions.toggle" });
    run({ type: "voice.toggleLanguage" });
    run({ type: "captions.clear" });
    await vi.waitFor(() => expect(reports.filter(Boolean)).toHaveLength(3));
    expect(noteDesktopSettings).toHaveBeenCalledWith({ captionsVisible: false });
    expect(noteDesktopSettings).toHaveBeenCalledWith({ voiceLanguage: "es", voiceId: "" });
    expect(reports.filter(Boolean)).toEqual([
      { key: "actions.captionsHidden" },
      { key: "actions.voiceChanged", params: { language: "Español" } },
      { key: "actions.captionCleared" },
    ]);
  });
});
