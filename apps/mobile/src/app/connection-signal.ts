/**
 * When to tell the person that the phone lost the computer, and when that it is back: the link to the
 * desktop goes up and down, and this decides the banner and the one-off signals (a vibration) from it.
 * Pure and clock-free: every event carries its time, and each step says when the next `tick` matters.
 */

/** A loss is only signalled once it lasted this long, so a short flap (a reconnect) goes unnoticed. */
export const CONNECTION_LOST_AFTER_MS = 2_000;
/** How long "Connected again" stays on screen. */
export const CONNECTION_RESTORED_FOR_MS = 3_000;

export type ConnectionBanner = "none" | "lost" | "restored";
/** Fired once per change the person should notice. */
export type ConnectionSignal = "lost" | "restored";

export type ConnectionEvent =
  /** The link to the computer opened. */
  | { type: "up"; at: number }
  /** The link closed, or an attempt to open it failed. */
  | { type: "down"; at: number }
  /** Time passed: the moment a step asked to be woken at, or later. */
  | { type: "tick"; at: number };

export interface ConnectionSignalState {
  /** "unknown" until the link opened once: failing while still looking for the computer is not a loss. */
  link: "unknown" | "up" | "down";
  /** When the link went down, while it is down. */
  downSince: number | null;
  banner: ConnectionBanner;
  /** When "Connected again" appeared, while it shows. */
  restoredAt: number | null;
}

export interface ConnectionSignalStep {
  state: ConnectionSignalState;
  signal: ConnectionSignal | null;
  /** The time of the next `tick` that can change something, or null when only a link change can. */
  wakeAt: number | null;
}

export const INITIAL_CONNECTION_SIGNAL: ConnectionSignalState = { link: "unknown", downSince: null, banner: "none", restoredAt: null };

export function stepConnectionSignal(state: ConnectionSignalState, event: ConnectionEvent): ConnectionSignalStep {
  let next = state;
  let signal: ConnectionSignal | null = null;

  if (event.type === "up" && state.link !== "up") {
    // Back before the loss was signalled: nothing to say.
    const wasLost = state.banner === "lost";
    next = { link: "up", downSince: null, banner: wasLost ? "restored" : state.banner, restoredAt: wasLost ? event.at : state.restoredAt };
    if (wasLost) signal = "restored";
  } else if (event.type === "down" && state.link === "up") {
    next = { ...state, link: "down", downSince: event.at };
  }

  // Whatever the event, time has moved on to `event.at`.
  if (next.link === "down" && next.downSince !== null && next.banner !== "lost" && event.at - next.downSince >= CONNECTION_LOST_AFTER_MS) {
    next = { ...next, banner: "lost", restoredAt: null };
    signal = "lost";
  }
  if (next.banner === "restored" && next.restoredAt !== null && event.at - next.restoredAt >= CONNECTION_RESTORED_FOR_MS) {
    next = { ...next, banner: "none", restoredAt: null };
  }

  return { state: next, signal, wakeAt: wakeAtOf(next) };
}

function wakeAtOf(state: ConnectionSignalState): number | null {
  const times: number[] = [];
  if (state.link === "down" && state.downSince !== null && state.banner !== "lost") times.push(state.downSince + CONNECTION_LOST_AFTER_MS);
  if (state.banner === "restored" && state.restoredAt !== null) times.push(state.restoredAt + CONNECTION_RESTORED_FOR_MS);
  return times.length === 0 ? null : Math.min(...times);
}

/** Vibration patterns (on, off, on… in ms), told apart by feel: a loss is three firm pulses, a return two light taps. */
export const VIBRATION_PATTERNS: Record<ConnectionSignal, readonly number[]> = {
  lost: [250, 120, 250, 120, 250],
  restored: [60, 80, 60],
};
