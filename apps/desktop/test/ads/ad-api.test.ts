import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileBoardRepository } from "../../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../../src/adapters/json-file-settings-store";
import { AdFeed } from "../../src/ads/ad-feed";
import { createDesktopServer, type DesktopServer } from "../../src/server/create-server";
import { FakeSynthesizer } from "../fake-synthesizer";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 3)]);

describe("ad API", () => {
  let dir: string;
  let server: DesktopServer;
  let baseUrl: string;

  const start = async (ads: AdFeed | undefined) => {
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 1,
      ads,
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  };

  const feedWith = (body: unknown) => {
    const fetch = (async (input: string | URL | Request) =>
      String(input).endsWith(".png")
        ? new Response(PNG, { headers: { "content-type": "image/png" } })
        : new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })) as typeof globalThis.fetch;
    return new AdFeed({ feedUrl: "https://ads.example/feed.json", dir: join(dir, "ad"), fetch, every: () => () => {} });
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-ad-api-"));
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("serves the cached sponsor and its image without remote image URLs", async () => {
    const ads = feedWith({ ad: { id: "a1", title: "Mics", linkUrl: "https://sponsor.example/", imageUrl: "https://cdn.example/a.png", alt: "Mic" } });
    await ads.refresh();
    await start(ads);

    const response = await fetch(`${baseUrl}/api/ad`);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ad: { id: "a1", title: "Mics", linkUrl: "https://sponsor.example/", alt: "Mic", imagePath: "/api/ad/image?v=a1" } });
    expect(text).not.toContain("cdn.example");

    const image = await fetch(`${baseUrl}/api/ad/image?v=a1`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG);
  });

  it("answers no sponsor and no image without a feed", async () => {
    await start(undefined);
    expect(await (await fetch(`${baseUrl}/api/ad`)).json()).toEqual({ ad: null });
    expect((await fetch(`${baseUrl}/api/ad/image`)).status).toBe(404);
  });

  it("answers 404 for the image of a creative without one", async () => {
    const ads = feedWith({ ad: { id: "a1", title: "Mics", linkUrl: "https://sponsor.example/" } });
    await ads.refresh();
    await start(ads);
    expect((await fetch(`${baseUrl}/api/ad/image`)).status).toBe(404);
  });
});
