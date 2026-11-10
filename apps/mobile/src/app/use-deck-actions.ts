import type { UiLanguage } from "@speed-deck/core";
import type { DeckAction } from "../components/ActionDeck";
import { useLanguage, useT } from "../i18n/I18nProvider";
import { LANGUAGE_NAMES, type Message } from "../i18n/messages";
import type { Speech } from "./use-speech";
import type { SpeechTarget } from "./use-speech-target";

type ActionTarget = Pick<SpeechTarget, "remoteActions" | "captionsVisible" | "setCaptionsVisible" | "voiceLanguage" | "setVoiceLanguage">;

/**
 * The actions deck: Stop, Repeat, Clear caption, Hide/Show captions and Switch voice language.
 * The OBS actions need the desktop, so they are disabled (with a hint) when speaking on this device.
 * Every result is announced through `report` (the live region).
 */
export function useDeckActions(target: ActionTarget, speech: Pick<Speech, "stop" | "repeat">, report: (message: Message) => void): DeckAction[] {
  const t = useT();
  const interfaceLanguage = useLanguage();
  const { remoteActions, captionsVisible } = target;
  const voiceLanguage = target.voiceLanguage ?? interfaceLanguage;
  const nextVoiceLanguage: UiLanguage = voiceLanguage === "es" ? "en" : "es";
  const obsHint = remoteActions ? undefined : t("actions.needsComputer");
  const failed = () => report({ key: "actions.failed" });

  return [
    {
      id: "stop",
      icon: "■",
      label: t("actions.stop"),
      onPress: () => {
        speech.stop();
        report({ key: "actions.stopped" });
      },
    },
    { id: "repeat", icon: "↻", label: t("actions.repeat"), onPress: speech.repeat },
    {
      id: "clear-caption",
      icon: "⌫",
      label: t("actions.clearCaption"),
      disabled: !remoteActions,
      hint: obsHint,
      onPress: () => {
        remoteActions?.clearCaption().then(() => report({ key: "actions.captionCleared" }), failed);
      },
    },
    {
      id: "captions",
      icon: "CC",
      label: t(captionsVisible === false ? "actions.showCaptions" : "actions.hideCaptions"),
      // Pressed while the captions are hidden.
      pressed: captionsVisible === null ? undefined : !captionsVisible,
      disabled: captionsVisible === null,
      hint: obsHint,
      onPress: () => {
        const visible = captionsVisible === false;
        target.setCaptionsVisible(visible);
        report({ key: visible ? "actions.captionsShown" : "actions.captionsHidden" });
      },
    },
    {
      id: "voice-language",
      icon: "🗣",
      label: t("actions.voiceLanguage", { language: LANGUAGE_NAMES[voiceLanguage] }),
      onPress: () => {
        target.setVoiceLanguage(nextVoiceLanguage);
        report({ key: "actions.voiceChanged", params: { language: LANGUAGE_NAMES[nextVoiceLanguage] } });
      },
    },
  ];
}
