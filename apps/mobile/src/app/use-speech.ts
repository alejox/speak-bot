import { EmptyTextError, pickVoiceForLanguage, speakText, SpeechQueueFullError, stopSpeaking, type SpeakMode, type UiLanguage } from "@speed-deck/core";
import { useEffect, useRef, useState } from "react";
import { DesktopRequestError } from "../adapters/desktop-api";
import { DesktopSpeechError } from "../adapters/remote-speech-synthesizer";
import { SpeechUnsupportedError } from "../adapters/web-speech-synthesizer";
import type { Message } from "../i18n/messages";
import { useLinkLost } from "./use-link-lost";
import type { SpeechTarget } from "./use-speech-target";
import { languageOf } from "./voice-options";

export interface Speech {
  /** Speaking here, or (when speaking on the computer) the desktop is speaking, whoever asked it to. */
  isSpeaking: boolean;
  /**
   * Says `text` at once, cutting off what is being said and emptying the queue; with "queue" it waits its turn
   * instead. When the computer speaks and cannot be reached, the phrase is said with this device's voice instead.
   */
  speak: (text: string, mode?: SpeakMode) => void;
  /** Stops what is being said and empties the queue. */
  stop: () => void;
  /** Says the last text spoken on this device again. */
  repeat: () => void;
  /** The computer is the one that speaks and the live link to it is down: `speak` will use this device's voice. */
  isComputerUnreachable: boolean;
  /**
   * Says `text` with this device's own voice because the computer could not be reached, and says so; with
   * no voice here either it says that instead. False when this view has no voice of its own to fall back to
   * (this device already speaks, the OBS dock): nothing was said or reported.
   */
  speakOnDevice: (text: string, mode?: SpeakMode) => boolean;
}

/**
 * Whether a request to the computer failed without the computer answering it: the network did not reach it,
 * or what answered could not serve it (a 5xx with no reason). A refusal with a reason (a full queue, a bad
 * request) is an answer: the computer is there, and saying the phrase here as well would talk over it.
 */
export function computerDidNotAnswer(error: unknown): boolean {
  if (error instanceof EmptyTextError || error instanceof SpeechQueueFullError || error instanceof DesktopSpeechError) return false;
  if (error instanceof DesktopRequestError) return error.code === undefined && error.status >= 500;
  return true;
}

/** Speaking and stopping on the current target, reporting failures as localized messages. */
export function useSpeech(
  target: Pick<SpeechTarget, "synthesizer" | "settings" | "speaksOnComputer" | "voices" | "voiceLanguage" | "onSpeechEvent" | "deviceSpeech" | "watchConnection">,
  language: UiLanguage,
  report: (message: Message | null) => void,
): Speech {
  const { synthesizer, settings, deviceSpeech } = target;
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Speech started on the desktop by a key, another device or a repeat; follows its events.
  const [isDesktopSpeaking, setIsDesktopSpeaking] = useState(false);
  const reportRef = useRef(report);
  reportRef.current = report;
  const { onSpeechEvent } = target;
  // Known before any request is tried, so the phrase can be said here inside the tap (a browser may refuse later).
  const isComputerUnreachable = useLinkLost(deviceSpeech ? target.watchConnection : null);

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

  /** Starts an utterance and keeps `isSpeaking` true until every one asked for here has settled. */
  const track = (utterance: Promise<void>, onError: (error: unknown) => void) => {
    const stops = stopCount.current;
    unsettled.current += 1;
    setIsSpeaking(true);
    utterance.catch(onError).finally(() => {
      if (stops !== stopCount.current) return;
      unsettled.current -= 1;
      if (unsettled.current === 0) setIsSpeaking(false);
    });
  };

  const speakOnDevice = (text: string, mode: SpeakMode = "interrupt"): boolean => {
    if (!deviceSpeech) return false;
    if (text.trim() === "") {
      report({ key: "error.emptyText" });
      return true;
    }
    if (!deviceSpeech.synthesizer.isSupported) {
      report({ key: "error.noVoiceAnywhere" });
      return true;
    }
    // The voice chosen for this device when it speaks the language in use, else this device's voice for that language.
    const chosen = deviceSpeech.voices.find((voice) => voice.id === deviceSpeech.settings.voiceId);
    const voice = chosen && languageOf(chosen.lang) === voiceLanguage ? chosen : pickVoiceForLanguage(deviceSpeech.voices, voiceLanguage);
    report({ key: "voice.spokenOnDevice" });
    track(speakText(deviceSpeech.synthesizer, text, { voiceId: voice?.id, rate: deviceSpeech.settings.rate, ...(mode === "queue" ? { mode } : {}) }), () =>
      // This device could not say it either (no voice installed, or the browser refused): nothing was heard.
      report({ key: "error.noVoiceAnywhere" }),
    );
    return true;
  };

  // Must not await before speakText: mobile browsers only allow speech inside the tap handler.
  const speak = (text: string, mode: SpeakMode = "interrupt") => {
    if (text.trim() !== "") lastText.current = text;
    report(null);
    if (isComputerUnreachable && speakOnDevice(text, mode)) return;
    track(speakText(synthesizer, text, { voiceId: voiceId || undefined, rate: settings.rate, ...(mode === "queue" ? { mode } : {}) }), (error) => {
      // The computer never answered: the phrase is still said, here.
      if (computerDidNotAnswer(error) && speakOnDevice(text, mode)) return;
      report(describeSpeechError(error));
    });
  };

  return {
    isSpeaking: isSpeaking || isDesktopSpeaking,
    isComputerUnreachable,
    speak,
    speakOnDevice,
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
      // A phrase said here because the computer dropped stops too.
      if (deviceSpeech?.synthesizer.isSupported) stopSpeaking(deviceSpeech.synthesizer);
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
