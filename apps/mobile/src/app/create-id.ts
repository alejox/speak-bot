let counter = 0;

/**
 * Generates a unique id. `crypto.randomUUID` only exists in secure contexts
 * (HTTPS or localhost), so testing over plain http on the LAN needs a fallback.
 */
export function createId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${counter.toString(36)}-${random}`;
}
