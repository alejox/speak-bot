import { faderPositionToMultiplier, multiplierToFaderPosition } from "@speed-deck/core";
import { useEffect, useRef, useState } from "react";
import type { ObsServices } from "./composition-root";

/** What a volume key needs from OBS: read, set and follow one input's volume. */
export type InputVolumeServices = Pick<ObsServices, "getInputVolume" | "setInputVolume" | "onInputVolume">;

/** While a slider moves, at most one volume request per this many milliseconds; the last value is always sent. */
export const VOLUME_SEND_INTERVAL_MS = 60;

export interface InputVolume {
  /** The fader position as a whole percent (0–100), or null until OBS answers. */
  percent: number | null;
  /** OBS has no input of this name with audio. */
  missing: boolean;
  /** The slider is held: OBS updates wait, and changes are sent at most every `VOLUME_SEND_INTERVAL_MS`. */
  hold: () => void;
  change: (percent: number) => void;
  /** The slider was let go: sends the last value if it was not sent yet, then follows OBS again. */
  release: () => void;
}

function percentOf(volumeMul: number): number {
  return Math.round(multiplierToFaderPosition(volumeMul) * 100);
}

/**
 * The volume of one OBS input, on the curve of the OBS mixer fader. Loaded when `active` (OBS connected)
 * and kept up to date by OBS's own changes, except while the slider is held.
 */
export function useInputVolume(services: InputVolumeServices | null, inputName: string, active: boolean): InputVolume {
  const [percent, setPercent] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const held = useRef(false);
  const latest = useRef<number | null>(null);
  const lastSent = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (value: number | null) => {
    latest.current = value;
    setPercent(value);
  };

  useEffect(() => {
    show(null);
    setMissing(false);
    if (!services || !active) return;
    let current = true;
    services.getInputVolume(inputName).then(
      (volumeMul) => {
        if (current && !held.current) show(percentOf(volumeMul));
      },
      () => {
        if (current) setMissing(true);
      },
    );
    const unsubscribe = services.onInputVolume((name, volumeMul) => {
      if (name !== inputName || held.current) return;
      setMissing(false);
      show(percentOf(volumeMul));
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [services, inputName, active]);

  useEffect(() => () => clearTimer(), []);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }

  function send(value: number) {
    lastSent.current = value;
    void services?.setInputVolume(inputName, faderPositionToMultiplier(value / 100)).catch(() => {});
  }

  function tick() {
    const value = pending.current;
    pending.current = null;
    if (value === null || value === lastSent.current) {
      timer.current = null;
      return;
    }
    send(value);
    timer.current = setTimeout(tick, VOLUME_SEND_INTERVAL_MS);
  }

  return {
    percent,
    missing,
    hold: () => {
      held.current = true;
    },
    change: (value) => {
      held.current = true;
      dirty.current = true;
      show(value);
      if (timer.current) {
        pending.current = value;
        return;
      }
      send(value);
      timer.current = setTimeout(tick, VOLUME_SEND_INTERVAL_MS);
    },
    release: () => {
      held.current = false;
      clearTimer();
      const value = latest.current;
      if (dirty.current && value !== null && value !== lastSent.current) send(value);
      dirty.current = false;
    },
  };
}
