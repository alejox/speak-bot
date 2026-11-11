import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AD_REFRESH_INTERVAL_MS, AdFeed, MAX_AD_IMAGE_BYTES } from "../../src/ads/ad-feed";

const FEED = "https://ads.example/feed.json";
const IMAGE = "https://cdn.example/banner.png";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const CREATIVE = { id: "spring-1", title: "Stream gear", text: "10% off mics", linkUrl: "https://sponsor.example/offer", imageUrl: IMAGE, alt: "A microphone" };

type Answer = { status?: number; body: string | Buffer; type?: string } | Error;

/** Answers each URL with its queue of responses and records what was requested. */
function fakeFetch(routes: Record<string, Answer[]>) {
  const requested: Array<{ url: string; redirect?: string }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    requested.push({ url, redirect: init?.redirect });
    const answer = routes[url]?.shift();
    if (!answer) throw new TypeError(`no route for ${url}`);
    if (answer instanceof Error) throw answer;
    return new Response(answer.body, { status: answer.status ?? 200, headers: { "content-type": answer.type ?? "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, requested };
}

const json = (value: unknown): Answer => ({ body: JSON.stringify(value) });
const png = (bytes: Buffer = PNG): Answer => ({ body: bytes, type: "image/png" });

describe("AdFeed", () => {
  let dir: string;
  let timers: Array<{ ms: number; run: () => void; stopped: boolean }>;

  const feed = (fetch: typeof globalThis.fetch, feedUrl: string | null = FEED) =>
    new AdFeed({
      feedUrl: feedUrl ?? undefined,
      dir,
      fetch,
      every: (ms, run) => {
        const timer = { ms, run, stopped: false };
        timers.push(timer);
        return () => {
          timer.stopped = true;
        };
      },
    });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-ads-"));
    timers = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("has no sponsor without a feed URL and never fetches", async () => {
    const { fetch, requested } = fakeFetch({});
    const ads = feed(fetch, null);
    await ads.start();
    expect(await ads.current()).toBeNull();
    expect(requested).toEqual([]);
    expect(timers).toEqual([]);
  });

  it("caches a valid creative and its image, serving only local paths", async () => {
    const { fetch, requested } = fakeFetch({ [FEED]: [json({ ad: CREATIVE })], [IMAGE]: [png()] });
    const ads = feed(fetch);
    await ads.refresh();
    expect(await ads.current()).toEqual({
      id: "spring-1",
      title: "Stream gear",
      text: "10% off mics",
      linkUrl: "https://sponsor.example/offer",
      alt: "A microphone",
      imagePath: "/api/ad/image?v=spring-1",
    });
    expect(await ads.image()).toEqual({ contentType: "image/png", bytes: PNG });
    expect(requested.every((request) => request.redirect === "error")).toBe(true);
  });

  it("serves a creative without an image", async () => {
    const { imageUrl: _image, alt: _alt, ...plain } = CREATIVE;
    const { fetch } = fakeFetch({ [FEED]: [json({ ad: plain })] });
    const ads = feed(fetch);
    await ads.refresh();
    expect(await ads.current()).toEqual({ id: "spring-1", title: "Stream gear", text: "10% off mics", linkUrl: "https://sponsor.example/offer" });
    expect(await ads.image()).toBeNull();
  });

  it("keeps the cached creative when the feed fails, is not JSON or is invalid", async () => {
    const bad: Answer[] = [
      new TypeError("offline"),
      { status: 500, body: "oops" },
      { body: "{not json" },
      json({ ad: { ...CREATIVE, linkUrl: "http://sponsor.example/" } }),
      json({ ad: { ...CREATIVE, linkUrl: "javascript:alert(1)" } }),
      json({ ad: { ...CREATIVE, imageUrl: "http://cdn.example/banner.png" } }),
      json({ ad: { ...CREATIVE, title: "" } }),
      json({ ad: { ...CREATIVE, title: "x".repeat(200) } }),
      json({ ad: { ...CREATIVE, id: "../../etc" } }),
      json({ something: "else" }),
      json([CREATIVE]),
    ];
    const { fetch } = fakeFetch({ [FEED]: [json({ ad: CREATIVE }), ...bad], [IMAGE]: [png()] });
    const ads = feed(fetch);
    await ads.refresh();
    const cached = await ads.current();
    for (let index = 0; index < bad.length; index += 1) {
      await ads.refresh();
      expect({ index, ad: await ads.current() }).toEqual({ index, ad: cached });
    }
  });

  it("keeps the cached creative when the new image is too large, of another type or a disguised file", async () => {
    const other = { ...CREATIVE, id: "summer-2", imageUrl: "https://cdn.example/other.png" };
    const { fetch } = fakeFetch({
      [FEED]: [json({ ad: CREATIVE }), json({ ad: other }), json({ ad: other }), json({ ad: other })],
      [IMAGE]: [png()],
      "https://cdn.example/other.png": [
        png(Buffer.concat([PNG, Buffer.alloc(MAX_AD_IMAGE_BYTES)])),
        { body: Buffer.from("<svg onload=alert(1)>"), type: "image/svg+xml" },
        { body: Buffer.from("<html>"), type: "image/png" },
      ],
    });
    const ads = feed(fetch);
    await ads.refresh();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await ads.refresh();
      expect((await ads.current())?.id).toBe("spring-1");
      expect(await ads.image()).toEqual({ contentType: "image/png", bytes: PNG });
    }
  });

  it("replaces the creative and its image when the feed changes", async () => {
    const next = { ...CREATIVE, id: "summer-2", imageUrl: "https://cdn.example/next.jpg" };
    const { fetch } = fakeFetch({
      [FEED]: [json({ ad: CREATIVE }), json({ ad: next })],
      [IMAGE]: [png()],
      "https://cdn.example/next.jpg": [{ body: JPEG, type: "image/jpeg" }],
    });
    const ads = feed(fetch);
    await ads.refresh();
    await ads.refresh();
    expect((await ads.current())?.imagePath).toBe("/api/ad/image?v=summer-2");
    expect(await ads.image()).toEqual({ contentType: "image/jpeg", bytes: JPEG });
  });

  it("does not download the same image again", async () => {
    const { fetch, requested } = fakeFetch({ [FEED]: [json({ ad: CREATIVE }), json({ ad: CREATIVE })], [IMAGE]: [png()] });
    const ads = feed(fetch);
    await ads.refresh();
    await ads.refresh();
    expect(requested.filter((request) => request.url === IMAGE)).toHaveLength(1);
  });

  it("removes the sponsor when the feed says there is none", async () => {
    const { fetch } = fakeFetch({ [FEED]: [json({ ad: CREATIVE }), json({ ad: null })], [IMAGE]: [png()] });
    const ads = feed(fetch);
    await ads.refresh();
    await ads.refresh();
    expect(await ads.current()).toBeNull();
    expect(await ads.image()).toBeNull();
  });

  it("ignores a corrupt cache file", async () => {
    await writeFile(join(dir, "ad.json"), "{broken");
    const { fetch } = fakeFetch({});
    expect(await feed(fetch).current()).toBeNull();
  });

  it("fetches at start and every 6 hours until stopped", async () => {
    const { fetch, requested } = fakeFetch({ [FEED]: [json({ ad: null }), json({ ad: null })] });
    const ads = feed(fetch);
    await ads.start();
    expect(requested).toHaveLength(1);
    expect(timers.map((timer) => timer.ms)).toEqual([AD_REFRESH_INTERVAL_MS]);
    expect(AD_REFRESH_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    timers[0]!.run();
    await ads.idle();
    expect(requested).toHaveLength(2);
    ads.stop();
    expect(timers[0]!.stopped).toBe(true);
  });

  it("stores the cache in its own folder", async () => {
    const { fetch } = fakeFetch({ [FEED]: [json({ ad: CREATIVE })], [IMAGE]: [png()] });
    await feed(fetch).refresh();
    expect(JSON.parse(await readFile(join(dir, "ad.json"), "utf8"))).toMatchObject({ id: "spring-1", imageType: "image/png" });
  });
});
