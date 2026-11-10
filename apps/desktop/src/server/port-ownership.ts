import { request } from "node:http";

export interface OwnershipProbeOptions {
  /** How long to wait for each loopback address to answer. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;
const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
/** Nothing listens there (or the address family is unavailable): no other app can answer. */
const NOBODY_THERE = new Set(["ECONNREFUSED", "EADDRNOTAVAIL", "EAFNOSUPPORT", "ENETUNREACH", "EHOSTUNREACH"]);

/**
 * Checks that every loopback address answering on `port` is this server instance.
 *
 * On macOS a 0.0.0.0 bind succeeds even when another app holds 127.0.0.1 or [::1] on the
 * same port, so a successful listen does not prove that `localhost:<port>` reaches us.
 */
export async function isPortOwnedBy(port: number, instanceId: string, options: OwnershipProbeOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const answers = await Promise.all(LOOPBACK_HOSTS.map((host) => probeHealth(host, port, timeoutMs)));
  return answers.every((answer) => answer === null || answer === instanceId);
}

/**
 * Resolves with the instance id that answered (empty string for anything that is not our
 * health response), or null when nothing listens on that address.
 */
function probeHealth(host: string, port: number, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = request({ host, port, path: "/api/health", method: "GET", agent: false, timeout: timeoutMs, headers: { connection: "close" } }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 64 * 1024) response.destroy();
        else chunks.push(chunk);
      });
      response.on("error", () => resolve(""));
      response.on("end", () => resolve(response.statusCode === 200 ? instanceIdOf(Buffer.concat(chunks).toString("utf8")) : ""));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error: NodeJS.ErrnoException) => resolve(error.code && NOBODY_THERE.has(error.code) ? null : ""));
    req.end();
  });
}

function instanceIdOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { instanceId?: unknown };
    return typeof parsed.instanceId === "string" ? parsed.instanceId : "";
  } catch {
    return "";
  }
}
