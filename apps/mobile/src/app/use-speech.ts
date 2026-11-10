import { EmptyTextError, pickVoiceForLanguage, speakText, stopSpeaking, type UiLanguage } from "@speak-bot/core";
import { useRef, useState } from "react";
import { DesktopRequestError } from "../adapters/desktop-api";
import { DesktopSpeechError } from "../adapters/remote-speech-synthesizer";
import { SpeechUnsupportedError } from "../adapters/web-speech-synthesizer";
import type { Message } from "../i18n/messages";
import type { SpeechTarget } from "./use-speech-target";

export interface Speech {
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
  /** Says the last spoken text again (on the desktop, the last text it spoke from any device). */
  repeat: () => void;
}

/** Speaking and stopping on the current target, reporting failures as localized messages. */
export function useSpeech(
  target: Pick<SpeechTarget, "synthesizer" | "settings" | "isRemote" | "voices" | "voiceLanguage" | "remoteActions">,
  language: UiLanguage,
  report: (message: Message | null) => void,
): Speech {
  const { synthesizer, settings } = target;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRequest = useRef(0);
  // Only this device's speech; the desktop remembers its own last text.
  const lastText = useRef<string | null>(null);

  // The desktop picks its own voice for the language; on this device it is picked here.
  const voiceLanguage = target.voiceLanguage ?? language;
  const voiceId = settings.voiceId || (target.isRemote ? undefined : pickVoiceForLanguage(target.voices, voiceLanguage)?.id);

  // Must not await before speakText: mobile browsers only allow speech inside the tap handler.
  const speak = (text: string) => {
    const request = ++speechRequest.current;
    if (text.trim() !== "") lastText.current = text;
    report(null);
    setIsSpeaking(true);
    speakText(synthesizer, text, { voiceId: voiceId || undefined, rate: settings.rate })
      .catch((error: unknown) => report(describeSpeechError(error)))
      .finally(() => {
        if (request === speechRequest.current) setIsSpeaking(false);
      });
  };

  return {
    isSpeaking,
    speak,
    repeat: () => {
      if (target.remoteActions) {
        report(null);
        target.remoteActions.repeat().catch((error: unknown) => report(describeSpeechError(error)));
      } else if (lastText.current === null) {
        report({ key: "error.nothingToRepeat" });
      } else {
        speak(lastText.current);
      }
    },
    stop: () => {
      speechRequest.current += 1;
      stopSpeaking(synthesizer);
      setIsSpeaking(false);
    },
  };
}

/** Maps a speech failure to a message in the interface language. */
export function describeSpeechError(error: unknown): Message {
  if (error instanceof EmptyTextError) return { key: "error.emptyText" };
  if (error instanceof SpeechUnsupportedError) return { key: "error.speechUnsupported" };
  if (error instanceof DesktopSpeechError) {
    return error.code === "engine-unavailable"
      ? { key: "error.engineUnavailable", params: { detail: error.message } }
      : { key: "error.desktopSpeechFailed" };
  }
  if (error instanceof DesktopRequestError) {
    return error.code === "nothing-to-repeat" ? { key: "error.nothingToRepeat" } : { key: "error.desktopRequestFailed" };
  }
  return { key: "error.speechFailed" };
}
