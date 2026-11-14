import type { AppUpdateState } from "@speed-deck/core";
import { useCallback, useEffect, useState } from "react";
import type { DesktopServices } from "./composition-root";

export interface AppUpdate {
  /** The computer app's version and update state; null when there is no computer app or it does not say. */
  update: AppUpdateState | null;
  /** Only the computer's own window may check, install or change the setting; a paired phone only reads. */
  canControl: boolean;
  check: () => void;
  install: () => void;
  setAutoCheck: (enabled: boolean) => void;
}

/**
 * Container logic for Settings → About and updates: loads the computer app's update state, follows its
 * changes and sends the three actions. Failures stay quiet: the state the computer broadcasts tells the rest.
 */
export function useAppUpdate(desktop: DesktopServices | undefined, available: boolean, isOnComputer: boolean): AppUpdate {
  const [update, setUpdate] = useState<AppUpdateState | null>(null);
  const remote = available ? desktop : undefined;

  useEffect(() => {
    if (!remote) return setUpdate(null);
    let active = true;
    const stop = remote.appUpdate.onChanged(setUpdate);
    remote.appUpdate.load().then(
      (loaded) => active && setUpdate((current) => current ?? loaded),
      () => undefined,
    );
    return () => {
      active = false;
      stop();
    };
  }, [remote]);

  const check = useCallback(() => {
    remote?.appUpdate.check().then(
      (checked) => checked && setUpdate(checked),
      () => undefined,
    );
  }, [remote]);
  const install = useCallback(() => {
    remote?.appUpdate.install().catch(() => undefined);
  }, [remote]);
  const setAutoCheck = useCallback(
    (enabled: boolean) => {
      // Shown at once; the computer confirms with an app-update event (or the next load corrects it).
      setUpdate((current) => (current ? { ...current, autoCheck: enabled } : current));
      remote?.saveSettings({ autoCheckUpdates: enabled }).catch(() => setUpdate((current) => (current ? { ...current, autoCheck: !enabled } : current)));
    },
    [remote],
  );

  return { update: remote ? update : null, canControl: isOnComputer, check, install, setAutoCheck };
}
