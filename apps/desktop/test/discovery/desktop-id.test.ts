import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateDesktopId } from "../../src/discovery/desktop-id";

describe("loadOrCreateDesktopId", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-id-"));
    file = join(dir, "desktop.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates an id on first run and saves it", async () => {
    const id = await loadOrCreateDesktopId(file, () => "first-id");

    expect(id).toBe("first-id");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ id: "first-id" });
  });

  it("returns the saved id on later runs", async () => {
    await loadOrCreateDesktopId(file, () => "first-id");

    expect(await loadOrCreateDesktopId(file, () => "second-id")).toBe("first-id");
  });

  it("replaces a file that holds no usable id", async () => {
    await writeFile(file, JSON.stringify({ id: "" }));

    expect(await loadOrCreateDesktopId(file, () => "new-id")).toBe("new-id");
    expect(await loadOrCreateDesktopId(file, () => "other")).toBe("new-id");
  });

  it("replaces a corrupt file", async () => {
    await writeFile(file, "{not json");

    expect(await loadOrCreateDesktopId(file, () => "new-id")).toBe("new-id");
  });
});
