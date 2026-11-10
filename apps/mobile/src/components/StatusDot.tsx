import type { ObsLive } from "../app/key-presentation";

/** How OBS is doing, as one of three tones: connected, connecting, or anything else. */
export type ObsTone = "ok" | "pending" | "off";

/** The OBS tone for this device: only the computer app reaches OBS, so without it OBS is never connected. */
export function obsTone(isComputerConnected: boolean, obs: ObsLive | null): ObsTone {
  if (!isComputerConnected || !obs || !obs.enabled) return "off";
  if (obs.status === "connected") return "ok";
  return obs.status === "connecting" ? "pending" : "off";
}

/**
 * A small status mark on an icon, so the state never rests on colour alone: a filled dot when connected,
 * a half-filled one while connecting, a hollow ring when not connected. Decorative: the name says it.
 */
export function StatusDot({ tone }: { tone: ObsTone }) {
  return <span className={`nav-status nav-status-${tone}`} aria-hidden="true" />;
}
