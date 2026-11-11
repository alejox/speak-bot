import { EmptyTextError, pickVoiceForLanguage, speakText, SpeechQueueFullError, stopSpeaking, type SpeakMode, type UiLanguage } from "@speed-deck/core";
import { useEffect, useRef, useState } from "react";
import { DesktopRequestError } from "../adapters/desktop-api";
import { DesktopSpeechError } from "../adapters/remote-speech-synthesizer";
import { SpeechUnsupportedError } from "../adapters/web-speech-synthesizer";
import type { Message } from "../i18n/messages";
import type { SpeechTarget } from "./use-speech-target";

export interface Speech {
  /** Speaking here, or (when speaking on the computer) the desktop is speaking, whoever asked it to. */
  isSpeaking: boolean;
  /** Says `text` at once, cutting off what is being said and emptying the queue; with "queue" it waits its turn instead. */
  speak: (text: string, mode?: SpeakMode) => void;
  /** Stops what is being said and empties the queue. */
  stop: () => void;
  /** Says the last text spoken on this device again. */
  repeat: () => void;
}

/** Speaking and stopping on the current target, reporting failures as localized messages. */
export function useSpeech(
  target: Pick<SpeechTarget, "synthesizer" | "settings" | "speaksOnComputer" | "voices" | "voiceLanguage" | "onSpeechEvent">,
  language: UiLanguage,
  report: (message: Message | null) => void,
): Speech {
  const { synthesizer, settings } = target;
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Speech started on the desktop by a key, another device or a repeat; follows its events.
  const [isDesktopSpeaking, setIsDesktopSpeaking] = useState(false);
  const reportRef = useRef(report);
  reportRef.current = report;
  const { onSpeechEvent } = target;

  useEffect(() => {
    setIsDesktopSpeaking(false);
    return onSpeechEvent((event) => {
      if (event.type === "speaking") setIsDesktopSpeaking(event.state === "start");
      else {
        setIsDesktopSpeaking(false);
        reportRef.current(describeSpeechError(new DesktopSpeechError(event.message, event.code)));
      }
    });
  }, [onSpeechEvent]);
  // Utterances asked for here and not settled yet; `stopCount` tells apart those a Stop already wrote off.
  const unsettled = useRef(0);
  const stopCount = useRef(0);
  // Only this device's speech; the desktop remembers its own last text.
  const lastText = useRef<string | null>(null);

  // The desktop picks its own voice for the language; on this device it is picked here.
  const voiceLanguage = target.voiceLanguage ?? language;
  const voiceId = settings.voiceId || (target.speaksOnComputer ? undefined : pickVoiceForLanguage(target.voices, voiceLanguage)?.id);

  // Must not await before speakText: mobile browsers only allow speech inside the tap handler.
  const speak = (text: string, mode: SpeakMode = "interrupt") => {
    const stops = stopCount.current;
    unsettled.current += 1;
    if (text.trim() !== "") lastText.current = text;
    report(null);
    setIsSpeaking(true);
    speakText(synthesizer, text, { voiceId: voiceId || undefined, rate: settings.rate, ...(mode === "queue" ? { mode } : {}) })
      .catch((error: unknown) => report(describeSpeechError(error)))
      .finally(() => {
        if (stops !== stopCount.current) return;
        unsettled.current -= 1;
        if (unsettled.current === 0) setIsSpeaking(false);
      });
  };

  return {
    isSpeaking: isSpeaking || isDesktopSpeaking,
    speak,
    repeat: () => {
      if (lastText.current === null) {
        report({ key: "error.nothingToRepeat" });
      } else {
        speak(lastText.current);
      }
    },
    stop: () => {
      stopCount.current += 1;
      unsettled.current = 0;
      stopSpeaking(synthesizer);
      setIsSpeaking(false);
      setIsDesktopSpeaking(false);
    },
  };
}

/** Maps a speech failure to a message in the interface language. */
export function describeSpeechError(error: unknown): Message {
  if (error instanceof EmptyTextError) return { key: "error.emptyText" };
  if (error instanceof SpeechUnsupportedError) return { key: "error.speechUnsupported" };
  if (error instanceof SpeechQueueFullError) return { key: "error.queueFull" };
  if (error instanceof DesktopSpeechError) {
    return error.code === "engine-unavailable"
      ? { key: "error.engineUnavailable", params: { detail: error.message } }
      : { key: "error.desktopSpeechFailed" };
  }
  if (error instanceof DesktopRequestError) {
    if (error.code === "queue-full") return { key: "error.queueFull" };
    return error.code === "nothing-to-repeat" ? { key: "error.nothingToRepeat" } : { key: "error.desktopRequestFailed" };
  }
  return { key: "error.speechFailed" };
}
