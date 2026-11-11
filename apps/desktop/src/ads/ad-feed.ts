import type { AdCreative } from "@speed-deck/core";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SerialQueue, readJsonFile, writeJsonFileAtomic } from "../adapters/json-file";
import { httpsUrl } from "../config/monetization";

export const AD_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MAX_AD_IMAGE_BYTES = 500 * 1024;
const MAX_FEED_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ID_LENGTH = 100;
const MAX_TITLE_LENGTH = 80;
const MAX_TEXT_LENGTH = 160;
const MAX_ALT_LENGTH = 200;

type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** What `ad.json` holds: the creative plus the remote image URL, which is never sent to clients. */
interface CachedAd {
  id: string;
  title: string;
  text?: string;
  linkUrl: string;
  alt?: string;
  imageUrl?: string;
  imageType?: ImageType;
}

/** A creative as the feed describes it, already validated. */
type FeedCreative = Omit<CachedAd, "imageType">;

export interface AdFeedOptions {
  /** https URL of the feed JSON; absent means no sponsors (the house banner shows). */
  feedUrl?: string;
  /** Folder for the cached creative and image (`dataDir/ad`). */
  dir: string;
  /** Defaults to the global fetch; tests inject a fake so they never reach the network. */
  fetch?: typeof globalThis.fetch;
  /** Runs `run` every `ms`; returns a function that stops it. Defaults to an unref'd setInterval. */
  every?: (ms: number, run: () => void) => () => void;
  log?: (message: string) => void;
}

/**
 * The sponsor banner. Fetches the feed `{ "ad": Creative | null }` at start and every 6 h, downloads
 * the creative's image (png, jpeg or webp, at most 500 KB) and keeps the last good creative on disk.
 * Any failure keeps the cache; `{ "ad": null }` removes the sponsor. Everything is fetched over https
 * without following redirects, and clients only ever receive `linkUrl` and local paths.
 */
export class AdFeed {
  private readonly queue = new SerialQueue();
  private readonly fetch: typeof globalThis.fetch;
  private readonly feedUrl: string | undefined;
  private stopTimer: (() => void) | undefined;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: AdFeedOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.feedUrl = httpsUrl(options.feedUrl);
  }

  private get metaFile(): string {
    return join(this.options.dir, "ad.json");
  }

  private get imageFile(): string {
    return join(this.options.dir, "image");
  }

  /** The cached sponsor as clients see it, or null. */
  async current(): Promise<AdCreative | null> {
    const cached = await this.queue.run(() => this.readCache());
    if (!cached) return null;
    const creative: { -readonly [K in keyof AdCreative]: AdCreative[K] } = { id: cached.id, title: cached.title, linkUrl: cached.linkUrl };
    if (cached.text) creative.text = cached.text;
    if (cached.alt) creative.alt = cached.alt;
    if (cached.imageType) creative.imagePath = `/api/ad/image?v=${encodeURIComponent(cached.id)}`;
    return creative;
  }

  /** The cached image of the current sponsor, or null. */
  image(): Promise<{ contentType: ImageType; bytes: Buffer } | null> {
    return this.queue.run(async () => {
      const cached = await this.readCache();
      if (!cached?.imageType) return null;
      try {
        return { contentType: cached.imageType, bytes: await readFile(this.imageFile) };
      } catch {
        return null;
      }
    });
  }

  /** Fetches the feed once. Never rejects: failures are logged and keep the cache. */
  refresh(): Promise<void> {
    const run = this.queue.run(() => this.update());
    const settled = run.catch((error: unknown) => this.options.log?.(`Ad feed: ${error instanceof Error ? error.message : String(error)}`));
    this.pending = settled;
    return settled;
  }

  /** Fetches now and every 6 h until `stop`; does nothing without a feed URL. */
  async start(): Promise<void> {
    if (!this.feedUrl) return;
    if (!this.stopTimer) {
      const every = this.options.every ?? unrefInterval;
      this.stopTimer = every(AD_REFRESH_INTERVAL_MS, () => void this.refresh());
    }
    await this.refresh();
  }

  stop(): void {
    this.stopTimer?.();
    this.stopTimer = undefined;
  }

  /** Resolves once the latest refresh has finished. */
  async idle(): Promise<void> {
    await this.pending;
  }

  private async update(): Promise<void> {
    if (!this.feedUrl) return;
    const response = await this.get(this.feedUrl);
    const raw = await readLimited(response, MAX_FEED_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new Error("the feed is not valid JSON.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body) || !("ad" in body)) throw new Error('the feed must be an object with an "ad" field.');
    const ad = (body as { ad: unknown }).ad;
    if (ad === null) {
      await rm(this.metaFile, { force: true });
      await rm(this.imageFile, { force: true });
      return;
    }
    const creative = parseCreative(ad);
    const previous = await this.readCache();
    const next: CachedAd = { ...creative };
    if (creative.imageUrl) {
      if (previous?.imageType && previous.imageUrl === creative.imageUrl) {
        next.imageType = previous.imageType;
      } else {
        const image = await this.downloadImage(creative.imageUrl);
        await this.writeImage(image.bytes);
        next.imageType = image.type;
      }
    }
    await writeJsonFileAtomic(this.metaFile, next);
    if (!creative.imageUrl) await rm(this.imageFile, { force: true });
  }

  private async downloadImage(url: string): Promise<{ type: ImageType; bytes: Buffer }> {
    const response = await this.get(url);
    const declared = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const bytes = await readLimited(response, MAX_AD_IMAGE_BYTES);
    const type = sniffImageType(bytes);
    if (!type || type !== declared) throw new Error("the image must be a png, jpeg or webp file.");
    return { type, bytes };
  }

  private async writeImage(bytes: Buffer): Promise<void> {
    await mkdir(this.options.dir, { recursive: true });
    const temp = `${this.imageFile}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await writeFile(temp, bytes);
      await rename(temp, this.imageFile);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  private async get(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetch(url, { redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new Error(`could not reach ${new URL(url).host}.`);
    }
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}.`);
    return response;
  }

  private async readCache(): Promise<CachedAd | null> {
    const content = await readJsonFile(this.metaFile);
    if (content.status !== "ok") return null;
    try {
      const creative = parseCreative(content.value);
      const imageType = (content.value as { imageType?: unknown }).imageType;
      return isImageType(imageType) ? { ...creative, imageType } : creative;
    } catch {
      return null;
    }
  }
}

function parseCreative(value: unknown): FeedCreative {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("the ad must be an object.");
  const { id, title, text, linkUrl, imageUrl, alt } = value as Record<string, unknown>;
  if (typeof id !== "string" || id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("ad.id must be letters, digits, dots, dashes or underscores.");
  const creative: FeedCreative = { id, title: requiredText(title, "title", MAX_TITLE_LENGTH), linkUrl: requiredHttps(linkUrl, "linkUrl") };
  if (text !== undefined) creative.text = requiredText(text, "text", MAX_TEXT_LENGTH);
  if (alt !== undefined) creative.alt = requiredText(alt, "alt", MAX_ALT_LENGTH);
  if (imageUrl !== undefined) creative.imageUrl = requiredHttps(imageUrl, "imageUrl");
  return creative;
}

function requiredText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`ad.${name} must be text of 1 to ${max} characters.`);
  }
  return value.trim();
}

function requiredHttps(value: unknown, name: string): string {
  const url = httpsUrl(value);
  if (!url) throw new Error(`ad.${name} must be an https URL.`);
  return url;
}

function isImageType(value: unknown): value is ImageType {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

/** The image type from the file's first bytes, so a mislabeled file is never served as an image. */
function sniffImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Reads the whole body, refusing it as soon as it grows past `limit` bytes. */
async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) throw new Error("the download is too large.");
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error("the download is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function unrefInterval(ms: number, run: () => void): () => void {
  const timer = setInterval(run, ms);
  timer.unref();
  return () => clearInterval(timer);
}
