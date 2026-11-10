// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBase } from "../vite.config";

describe("resolveBase", () => {
  it("serves from the root unless told otherwise (the desktop app)", () => {
    expect(resolveBase(undefined)).toBe("/");
    expect(resolveBase("")).toBe("/");
  });

  it("normalizes a sub-path such as GitHub Pages' /speak-bot/", () => {
    expect(resolveBase("/speak-bot/")).toBe("/speak-bot/");
    expect(resolveBase("speak-bot")).toBe("/speak-bot/");
  });
});

describe("build under /speak-bot/", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "speed-deck-pages-"));
    process.env.SPEED_DECK_BASE = "/speak-bot/";
    try {
      await build({ root, configFile: join(root, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
    } finally {
      delete process.env.SPEED_DECK_BASE;
    }
  }, 60_000);

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("points every asset, the icon and the service worker at /speak-bot/", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toMatch(/src="\/speak-bot\/assets\/[^"]+\.js"/);
    expect(html).toContain('href="/speak-bot/icon.svg"');
    expect(html).toContain('href="/speak-bot/icon-maskable.svg"');
    expect(html).toContain('href="/speak-bot/manifest.webmanifest"');
    expect(html).not.toMatch(/(src|href)="\/(assets|icon\.svg|manifest)/);

    const register = await readFile(join(outDir, "registerSW.js"), "utf8");
    expect(register).toContain("/speak-bot/sw.js");
    expect(register).toContain("scope: '/speak-bot/'");
  });

  it("bundles the Inter font and precaches its Latin files so text looks the same offline", async () => {
    const assets = await readdir(join(outDir, "assets"));
    const css = assets.filter((name) => name.endsWith(".css"));
    const styles = (await Promise.all(css.map((name) => readFile(join(outDir, "assets", name), "utf8")))).join("\n");
    expect(styles).toContain("Inter Variable");
    expect(styles).toMatch(/url\(\/speak-bot\/assets\/inter-latin-wght-normal-[^)]+\.woff2\)/);

    const worker = await readFile(join(outDir, "sw.js"), "utf8");
    expect(worker).toMatch(/assets\/inter-latin-wght-normal-[^"']+\.woff2/);
    expect(worker).toMatch(/assets\/inter-latin-ext-wght-normal-[^"']+\.woff2/);
    // Scripts Spanish and English never use are fetched only if a key needs them, never precached.
    expect(worker).not.toMatch(/inter-(cyrillic|greek|vietnamese)/);
  });

  it("starts the installed app at /speak-bot/", async () => {
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.webmanifest"), "utf8")) as Record<string, unknown>;
    expect(manifest.start_url).toBe("/speak-bot/");
    expect(manifest.scope).toBe("/speak-bot/");
  });
});
