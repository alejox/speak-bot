import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The OBS caption overlay shipped with the desktop app. */
export const OVERLAY_FILE = fileURLToPath(new URL("../../public/overlay.html", import.meta.url));
/** The mobile PWA build, served at `/`. */
export const MOBILE_DIST_DIR = fileURLToPath(new URL("../../../mobile/dist", import.meta.url));

type PathApi = Pick<typeof path, "resolve" | "sep" | "extname">;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/**
 * Maps a URL pathname to a file inside `root`, or null when it would escape it.
 * Splits on both `/` and `\` and rejects `..` and drive letters, so it is safe on Windows too.
 */
export function resolveSafePath(root: string, urlPath: string, pathApi: PathApi = path): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const segments = decoded.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  if (segments.some((segment) => segment === ".." || segment.includes(":"))) return null;

  const base = pathApi.resolve(root);
  const resolved = pathApi.resolve(base, ...segments);
  return resolved === base || resolved.startsWith(base + pathApi.sep) ? resolved : null;
}

export interface PageHandlerOptions {
  mobileDistDir: string;
  overlayFile: string;
}

/** Serves `/overlay` and the mobile build (with SPA fallback). Only handles GET and HEAD. */
export function createPageHandler({ mobileDistDir, overlayFile }: PageHandlerOptions) {
  return async function handlePage(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (request.method !== "GET" && request.method !== "HEAD") return false;

    if (pathname === "/overlay" || pathname === "/overlay/") {
      return sendFile(request, response, overlayFile, "no-cache");
    }

    const indexFile = path.join(mobileDistDir, "index.html");
    if (!(await isFile(indexFile))) {
      sendText(response, 503, "text/html; charset=utf-8", MISSING_BUILD_PAGE);
      return true;
    }

    const file = resolveSafePath(mobileDistDir, pathname);
    if (file === null) {
      sendText(response, 404, "text/plain; charset=utf-8", "Not found.");
      return true;
    }
    if (await isFile(file)) {
      const immutable = pathname.startsWith("/assets/");
      return sendFile(request, response, file, immutable ? "public, max-age=31536000, immutable" : "no-cache");
    }
    // App routes have no extension and fall back to the SPA; missing assets are real 404s.
    if (path.extname(pathname) === "") return sendFile(request, response, indexFile, "no-cache");

    sendText(response, 404, "text/plain; charset=utf-8", "Not found.");
    return true;
  };
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function sendFile(request: IncomingMessage, response: ServerResponse, file: string, cacheControl: string): Promise<boolean> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    sendText(response, 404, "text/plain; charset=utf-8", "Not found.");
    return true;
  }
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": size,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  await new Promise<void>((resolve) => {
    createReadStream(file)
      .on("error", () => {
        response.destroy();
        resolve();
      })
      .on("end", resolve)
      .pipe(response);
  });
  return true;
}

function sendText(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(body) });
  response.end(body);
}

const MISSING_BUILD_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Speed Deck</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; line-height: 1.5">
<h1>The Speed Deck app is not built yet</h1>
<p>The desktop server is running, but the mobile app has not been built. From the repository root, run:</p>
<pre>npm run build -w apps/mobile</pre>
<p>Then reload this page. The OBS overlay is already available at <a href="/overlay">/overlay</a>.</p>
</body>
</html>
`;
