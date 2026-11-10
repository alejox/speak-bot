import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_BODY_BYTES = 16 * 1024;

/** An error that maps directly to an HTTP status and a JSON `{ error }` body. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

export function sendEmpty(response: ServerResponse, status: number): void {
  response.writeHead(status, { "cache-control": "no-store" });
  response.end();
}

/**
 * Reads a JSON body. Requiring `application/json` forces a CORS preflight for cross-origin
 * requests, which this server never approves, so other websites cannot trigger speech.
 */
export async function readJsonBody(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/json\b/i.test(contentType)) throw new HttpError(415, "Content-Type must be application/json.");

  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > limit) throw new HttpError(413, "Request body is too large.");

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

/** The request pathname, or null when the request target is not a valid URL. Never throws. */
export function requestPathname(request: IncomingMessage): string | null {
  try {
    return new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
}
