import { useEffect, useState } from "react";
import type { ObsServices } from "./composition-root";
import type { ObsLive } from "./key-presentation";

/**
 * OBS as the desktop reports it: loaded once, then kept up to date by `obs-status` and `obs-state`
 * events. Null in phone-only mode or until the desktop answers.
 */
export function useObs(obs: ObsServices | null, enabled: boolean | null): ObsLive | null {
  const [live, setLive] = useState<ObsLive | null>(null);

  useEffect(() => {
    setLive(null);
    if (!obs) return;
    let active = true;
    obs.loadStatus().then(
      ({ enabled: isEnabled, status, state }) => active && setLive((current) => current ?? { enabled: isEnabled, status, state }),
      () => {},
    );
    const unsubscribe = obs.onEvent((event) =>
      setLive((current) => {
        const base = current ?? { enabled: true, status: "disconnected" as const, state: EMPTY_STATE };
        return event.type === "obs-status" ? { ...base, status: event.status } : { ...base, state: event.state };
      }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [obs]);

  // The settings are the source of truth for "enabled" once they are loaded.
  return live && enabled !== null ? { ...live, enabled } : live;
}

const EMPTY_STATE = { currentScene: null, mutedInputs: [], streaming: false, recording: false };
