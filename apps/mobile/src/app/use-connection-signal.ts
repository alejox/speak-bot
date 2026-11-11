import { useEffect, useRef, useState } from "react";
import { INITIAL_CONNECTION_SIGNAL, stepConnectionSignal, type ConnectionBanner, type ConnectionEvent, type ConnectionSignal } from "./connection-signal";

type WatchConnection = (listener: (connected: boolean) => void) => () => void;

/**
 * Follows the link to the computer and returns the banner to show; `onSignal` runs once when a loss
 * lasted long enough and once when the computer is back. Nothing is watched without `watch`.
 */
export function useConnectionSignal(watch: WatchConnection | undefined, onSignal: (signal: ConnectionSignal) => void): ConnectionBanner {
  const [banner, setBanner] = useState<ConnectionBanner>("none");
  const signal = useRef(onSignal);
  signal.current = onSignal;

  useEffect(() => {
    if (!watch) return;
    let state = INITIAL_CONNECTION_SIGNAL;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = (event: ConnectionEvent) => {
      const step = stepConnectionSignal(state, event);
      state = step.state;
      setBanner(state.banner);
      if (step.signal) signal.current(step.signal);
      clearTimeout(timer);
      timer = step.wakeAt === null ? undefined : setTimeout(() => apply({ type: "tick", at: Date.now() }), Math.max(0, step.wakeAt - Date.now()));
    };
    const stop = watch((connected) => apply({ type: connected ? "up" : "down", at: Date.now() }));
    return () => {
      stop();
      clearTimeout(timer);
      setBanner("none");
    };
  }, [watch]);

  return banner;
}
