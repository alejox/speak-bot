import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

export interface RequestGuardOptions {
  /** This machine's name; `<name>` and `<name>.local` are accepted as Host. */
  hostname: string;
  /** Extra Host names the user trusts (for custom DNS names). */
  allowedHosts?: readonly string[];
}

/**
 * Decides whether a request may reach the server.
 *
 * - `Host` must be loopback, an IP literal (phones use the LAN IP), this machine's name or a
 *   configured host. Any other domain name is rejected, which defeats DNS rebinding.
 * - `Origin`, when present, must point at the same host, so other websites cannot use the
 *   API or read captions from the WebSocket. Clients that omit it (curl, OBS) are allowed.
 */
export function createRequestGuard({ hostname, allowedHosts = [] }: RequestGuardOptions) {
  const machine = hostname.trim().toLowerCase();
  const trusted = new Set(["localhost", ...allowedHosts.map((host) => host.trim().toLowerCase())]);
  if (machine) {
    trusted.add(machine);
    trusted.add(`${machine}.local`);
  }

  return function isAllowedRequest(request: IncomingMessage): boolean {
    const host = parseHost(request.headers.host);
    if (!host) return false;
    const name = host.hostname.startsWith("[") ? host.hostname.slice(1, -1) : host.hostname;
    if (isIP(name) === 0 && !trusted.has(name)) return false;

    const origin = request.headers.origin;
    if (origin === undefined) return true;
    try {
      const url = new URL(origin);
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname === host.hostname && url.port === host.port;
    } catch {
      return false;
    }
  };
}

function parseHost(header: string | undefined): URL | null {
  if (!header) return null;
  try {
    const url = new URL(`http://${header}`);
    // Reject anything that is not a bare `host[:port]` (credentials, paths, etc.).
    return url.host === header.toLowerCase() || `${url.hostname}:80` === header.toLowerCase() ? url : null;
  } catch {
    return null;
  }
}
