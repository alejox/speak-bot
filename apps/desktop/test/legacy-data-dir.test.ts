import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyDataDir } from "../src/adapters/legacy-data-dir";

describe("migrateLegacyDataDir", () => {
  let root: string;
  let legacyDataDir: string;
  let dataDir: string;
  let logs: string[];
  const log = (message: string) => logs.push(message);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "speed-deck-data-dir-"));
    legacyDataDir = join(root, "speak-bot");
    dataDir = join(root, "speed-deck");
    logs = [];
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("copies the old data directory once, keeping the original", async () => {
    await mkdir(join(legacyDataDir, "nested"), { recursive: true });
    await writeFile(join(legacyDataDir, "settings.json"), '{"rate":1.5}');
    await writeFile(join(legacyDataDir, "nested", "file.txt"), "kept");

    expect(await migrateLegacyDataDir({ dataDir, legacyDataDir }, log)).toBe("copied");
    expect(await readFile(join(dataDir, "settings.json"), "utf8")).toBe('{"rate":1.5}');
    expect(await readFile(join(dataDir, "nested", "file.txt"), "utf8")).toBe("kept");
    expect(await readFile(join(legacyDataDir, "settings.json"), "utf8")).toBe('{"rate":1.5}');
    expect(logs.join("\n")).toContain(legacyDataDir);
    expect(await readdir(root)).toEqual(["speak-bot", "speed-deck"]);

    // Later starts leave both directories alone.
    await writeFile(join(legacyDataDir, "settings.json"), '{"rate":2}');
    expect(await migrateLegacyDataDir({ dataDir, legacyDataDir }, log)).toBe("unchanged");
    expect(await readFile(join(dataDir, "settings.json"), "utf8")).toBe('{"rate":1.5}');
  });

  it("does nothing on a new install, with an explicit data directory, or when the new directory exists", async () => {
    expect(await migrateLegacyDataDir({ dataDir, legacyDataDir }, log)).toBe("unchanged");
    expect(await migrateLegacyDataDir({ dataDir }, log)).toBe("unchanged");

    await mkdir(legacyDataDir);
    await writeFile(join(legacyDataDir, "boards.json"), "[]");
    await mkdir(dataDir);
    expect(await migrateLegacyDataDir({ dataDir, legacyDataDir }, log)).toBe("unchanged");
    expect(await readdir(dataDir)).toEqual([]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("never fails startup when the copy fails", async () => {
    await mkdir(legacyDataDir);
    await writeFile(join(legacyDataDir, "settings.json"), "{}");
    // An unreadable file makes the copy fail.
    await chmod(join(legacyDataDir, "settings.json"), 0o000);
    try {
      expect(await migrateLegacyDataDir({ dataDir, legacyDataDir }, log)).toBe("failed");
    } finally {
      await chmod(join(legacyDataDir, "settings.json"), 0o600);
    }
    expect(logs.join("\n")).toMatch(/Could not copy/);
    expect(await readdir(root)).toEqual(["speak-bot"]);
  });

  it("ignores an old path that is not a directory", async () => {
    await writeFile(legacyDataDir, "not a directory");
    expect(await migrateLegacyDataDir({ dataDir, legacyDataDir }, log)).toBe("unchanged");
    expect(await readdir(root)).toEqual(["speak-bot"]);
  });
});
