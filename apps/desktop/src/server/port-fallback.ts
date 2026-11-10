const MAX_PORT = 65535;

/** The preferred port followed by the next ones, without going past the last valid port. */
export function candidatePorts(port: number, attempts: number): number[] {
  if (port === 0) return [0];
  const ports: number[] = [];
  for (let candidate = port; candidate <= MAX_PORT && ports.length < Math.max(1, attempts); candidate += 1) {
    ports.push(candidate);
  }
  return ports;
}

export interface PortFallbackOptions {
  port: number;
  /** How many consecutive ports to try. */
  attempts: number;
  /**
   * Confirms, after a successful listen, that the port really reaches this server. Some
   * systems let a wildcard bind succeed while another app holds the loopback address.
   */
  isOwned?: (port: number) => Promise<boolean>;
  /** Stops listening on a port that turned out to be shared with another app. */
  release?: (port: number) => Promise<void>;
}

/**
 * Calls `tryListen` with the preferred port and, while it fails with EADDRINUSE (or the port
 * is not ours after all), the next ones. Resolves with the port that worked. Any other error
 * (e.g. EACCES) stops immediately.
 */
export async function listenWithFallback(
  tryListen: (port: number) => Promise<void>,
  { port, attempts, isOwned, release }: PortFallbackOptions,
): Promise<number> {
  const ports = candidatePorts(port, attempts);
  for (const candidate of ports) {
    try {
      await tryListen(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      continue;
    }
    if (!isOwned || (await isOwned(candidate))) return candidate;
    await release?.(candidate);
  }
  const range = ports.length === 1 ? `Port ${ports[0]} is` : `Ports ${ports[0]}–${ports[ports.length - 1]} are all`;
  throw new Error(`${range} in use.`);
}
