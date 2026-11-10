/**
 * The web app is also a PWA, so its build ships a service worker. Inside the desktop app it adds
 * nothing (every file is already on disk) and it hurts: it caches the UI under the local origin,
 * so after an update the window keeps showing the previous version. The desktop app therefore
 * never lets it register.
 */

/** Paths of the service worker and of the script that registers it (vite-plugin-pwa output). */
const SERVICE_WORKER_PATHS = new Set(["/sw.js", "/registerSW.js"]);

/** True when `url` is the PWA service worker, or its registration script, on the app's origin. */
export function isServiceWorkerRequest(url: string, origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.origin === origin && SERVICE_WORKER_PATHS.has(parsed.pathname);
}
