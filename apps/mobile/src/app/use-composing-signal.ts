import { useEffect, useRef } from "react";

/** Without a keystroke for this long, the person is no longer typing. */
export const COMPOSING_IDLE_MS = 8000;
/** While the typing goes on the flag is sent again this often, before the computer lets it expire. */
export const COMPOSING_REFRESH_MS = 5000;

export interface ComposingSignal {
  /** The text changed by hand (a keystroke, a paste, the clear button). */
  typed: (text: string) => void;
  /** The text was handed over to be spoken. */
  sent: () => void;
}

/**
 * Tells the computer whether someone is typing something to say, so the stream overlay can show it. Only a
 * flag ever leaves this device, never the text. It turns on when the text becomes non-empty, and off when
 * the text is emptied or spoken, after `COMPOSING_IDLE_MS` without a keystroke, and when the composer goes
 * away. `report` is called on changes, plus a refresh at most every `COMPOSING_REFRESH_MS` while the typing
 * goes on. Without `report` (this device speaks) nothing is tracked or sent.
 */
export function useComposingSignal(report: ((composing: boolean) => void) | null | undefined): ComposingSignal {
  // `told` is whoever heard "typing" last and has not heard that it ended.
  const state = useRef<{ told: ((composing: boolean) => void) | null; sentAt: number; idle: ReturnType<typeof setTimeout> | undefined }>({ told: null, sentAt: 0, idle: undefined });
  const reportRef = useRef(report);
  reportRef.current = report;

  const stop = () => {
    clearTimeout(state.current.idle);
    state.current.idle = undefined;
    const { told } = state.current;
    state.current.told = null;
    told?.(false);
  };

  // The composer went away, or the speak target changed: whoever was told "typing" is told it ended.
  useEffect(
    () => () => {
      if (report && state.current.told === report) stop();
    },
    [report],
  );

  return {
    typed: (text) => {
      const tell = reportRef.current;
      if (!tell || text === "") return stop();
      clearTimeout(state.current.idle);
      state.current.idle = setTimeout(stop, COMPOSING_IDLE_MS);
      const now = Date.now();
      if (state.current.told === tell && now - state.current.sentAt < COMPOSING_REFRESH_MS) return;
      // A new speak target: the one told before hears that it ended.
      if (state.current.told && state.current.told !== tell) state.current.told(false);
      state.current.told = tell;
      state.current.sentAt = now;
      tell(true);
    },
    sent: stop,
  };
}
