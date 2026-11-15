import { useEffect, useState } from "react";

type WatchConnection = (listener: (connected: boolean) => void) => () => void;

/**
 * True while the live link to the computer is down after having been up: what the events kept up to date
 * (OBS state, captions) can no longer be trusted until the link is back and it was read again. A link that
 * has not opened yet is not a loss: what was just loaded is fresh.
 */
export function useLinkLost(watch: WatchConnection | null | undefined): boolean {
  const [isLost, setIsLost] = useState(false);

  useEffect(() => {
    if (!watch) return;
    let wasUp = false;
    const stop = watch((connected) => {
      if (connected) {
        wasUp = true;
        setIsLost(false);
      } else if (wasUp) setIsLost(true);
    });
    return () => {
      stop();
      setIsLost(false);
    };
  }, [watch]);

  return isLost;
}
