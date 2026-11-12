export type LinkDecision = { allow: true } | { allow: false; openExternal?: string };

export interface ExternalLinkPolicy {
  /** The window is about to navigate to `url`: stay only on the app's own origin. */
  navigate(url: string): LinkDecision;
  /** The page asked for a new window (`target="_blank"`, `window.open`): never inside the app. */
  open(url: string): LinkDecision;
}

/**
 * Keeps the window on the app's own pages. Sponsor links open in the system browser,
 * and only when they are https: other schemes (http, file, custom protocols) are never handed to the OS.
 */
export function externalLinkPolicy(origin: string): ExternalLinkPolicy {
  const external = (url: string): LinkDecision => {
    const safe = httpsUrl(url);
    return safe ? { allow: false, openExternal: safe } : { allow: false };
  };
  return {
    navigate: (url) => (originOf(url) === origin ? { allow: true } : external(url)),
    open: external,
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function httpsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname !== "" ? parsed.href : null;
  } catch {
    return null;
  }
}
