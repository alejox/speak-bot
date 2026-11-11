import type { ServiceAnnouncement } from "./service-advertiser";

/** Phones browse for `_speeddeck._tcp`. */
export const SPEED_DECK_SERVICE_TYPE = "speeddeck";
/** Bumped when the TXT fields or the HTTP API change in a way older phone apps cannot handle. */
export const DISCOVERY_PROTOCOL_VERSION = "1";
/** DNS labels, and so instance names, are at most 63 bytes. */
const MAX_INSTANCE_NAME_BYTES = 63;
const FALLBACK_NAME = "Speed Deck";

export interface DesktopAnnouncementInput {
  /** Stable across restarts and IP changes; lets the phone find the same computer again. */
  desktopId: string;
  /** Shown to the user in the list of computers. */
  displayName: string;
  port: number;
}

/**
 * The announcement of this desktop. TXT fields: `id` (stable desktop id), `name` (display name)
 * and `v` (discovery protocol version). The instance name adds a short id so two computers with
 * the same name do not collide.
 */
export function desktopAnnouncement({ desktopId, displayName, port }: DesktopAnnouncementInput): ServiceAnnouncement {
  const suffix = ` (${desktopId.replace(/-/g, "").slice(0, 6)})`;
  const budget = MAX_INSTANCE_NAME_BYTES - Buffer.byteLength(suffix, "utf8");
  return {
    type: SPEED_DECK_SERVICE_TYPE,
    name: `${truncateUtf8(displayName, budget)}${suffix}`,
    port,
    txt: { id: desktopId, name: displayName, v: DISCOVERY_PROTOCOL_VERSION },
  };
}

/** A readable computer name from the host name: "Studio-Mac.local" becomes "Studio-Mac". */
export function computerDisplayName(hostname: string): string {
  const name = hostname.split(".")[0]?.trim() ?? "";
  return name === "" ? FALLBACK_NAME : name;
}

function truncateUtf8(text: string, maxBytes: number): string {
  let result = "";
  for (const char of text) {
    if (Buffer.byteLength(result + char, "utf8") > maxBytes) break;
    result += char;
  }
  return result;
}
