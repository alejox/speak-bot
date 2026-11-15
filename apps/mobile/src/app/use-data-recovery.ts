import type { DataRecoveryNotice } from "@speed-deck/core";
import { useCallback, useEffect, useState } from "react";
import type { DesktopServices } from "./composition-root";

export interface DataRecovery {
  /** What the computer did about a damaged boards file, until dismissed; null when there is nothing to tell. */
  notice: DataRecoveryNotice | null;
  /** Hides the notice at once and tells the computer, which remembers it for every window and every start. */
  dismiss: () => void;
}

/**
 * Container logic for the notice about a damaged boards file. Only the computer's own window asks: the notice
 * names a file on that computer's disk. It is read at start, when the computer says something changed and
 * each time the link to it reopens.
 */
export function useDataRecovery(desktop: DesktopServices | undefined, enabled: boolean): DataRecovery {
  const [notice, setNotice] = useState<DataRecoveryNotice | null>(null);
  const remote = enabled ? desktop : undefined;

  useEffect(() => {
    if (!remote) return setNotice(null);
    let active = true;
    // Only the answer to the latest question counts: an older one may describe a notice dismissed since.
    let asked = 0;
    const load = () => {
      const question = (asked += 1);
      remote.dataRecovery.load().then(
        (loaded) => active && question === asked && setNotice(loaded),
        () => undefined,
      );
    };
    load();
    const stop = remote.dataRecovery.onChanged(load);
    return () => {
      active = false;
      stop();
    };
  }, [remote]);

  const dismiss = useCallback(() => {
    setNotice(null);
    // If the computer did not hear it, the notice is back the next time it is read.
    remote?.dataRecovery.dismiss().catch(() => undefined);
  }, [remote]);

  return { notice: remote ? notice : null, dismiss };
}
