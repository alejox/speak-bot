import { ACTION_REGISTRY, type Action, type NavigationAction, type UiLanguage } from "@speed-deck/core";
import { LANGUAGE_NAMES, type Message } from "../i18n/messages";
import { describeRequestError } from "./describe-error";
import type { Speech } from "./use-speech";
import type { SpeechTarget } from "./use-speech-target";

type RunnerTarget = Pick<SpeechTarget, "executeAction" | "noteDesktopSettings" | "setVoiceLanguage">;

export interface KeyRunnerOptions {
  target: RunnerTarget;
  speech: Pick<Speech, "speak" | "stop" | "repeat">;
  /** The voice language in use right now (for the language key in phone-only mode). */
  voiceLanguage: UiLanguage;
  navigate: (action: NavigationAction) => void;
  report: (message: Message | null) => void;
}

/**
 * Runs a key's action where it belongs: navigation in this client; voice on this device in phone-only
 * mode; everything else on the desktop. Local speech starts synchronously, inside the tap (iOS rule).
 */
export function createKeyRunner({ target, speech, voiceLanguage, navigate, report }: KeyRunnerOptions): (action: Action) => void {
  const nextLanguage: UiLanguage = voiceLanguage === "es" ? "en" : "es";
  return (action) => {
    if (ACTION_REGISTRY[action.type].runsOn === "client") {
      navigate(action as NavigationAction);
      return;
    }
    const { executeAction } = target;
    if (!executeAction) {
      runOnDevice(action);
      return;
    }
    report(null);
    executeAction(action).then(
      (result) => {
        if (result.voiceLanguage) {
          target.noteDesktopSettings({ voiceLanguage: result.voiceLanguage, voiceId: "" });
          report({ key: "actions.voiceChanged", params: { language: LANGUAGE_NAMES[result.voiceLanguage] } });
        } else if (typeof result.captionsVisible === "boolean") {
          target.noteDesktopSettings({ captionsVisible: result.captionsVisible });
          report({ key: result.captionsVisible ? "actions.captionsShown" : "actions.captionsHidden" });
        } else if (action.type === "captions.clear") report({ key: "actions.captionCleared" });
        else if (action.type === "voice.stop") report({ key: "actions.stopped" });
      },
      (error: unknown) => report(describeRequestError(error)),
    );
  };

  function runOnDevice(action: Action): void {
    switch (action.type) {
      case "voice.speak":
        speech.speak(action.text);
        return;
      case "voice.stop":
        speech.stop();
        report({ key: "actions.stopped" });
        return;
      case "voice.repeat":
        speech.repeat();
        return;
      case "voice.toggleLanguage":
        target.setVoiceLanguage(nextLanguage);
        report({ key: "actions.voiceChanged", params: { language: LANGUAGE_NAMES[nextLanguage] } });
        return;
      default:
        // Captions and OBS keys are disabled without the desktop.
        report({ key: "key.needsComputer" });
    }
  }
}
