import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_CORRUPT_COPIES, readJsonFile, writeJsonFileAtomic, type JsonFileRecovery } from "../src/adapters/json-file";

describe("the shared JSON file store", () => {
  let dir: string;
  let file: string;
  let clock: number;
  const logs: string[] = [];
  const recoveries: JsonFileRecovery[] = [];
  const hooks = { now: () => (clock += 1000), log: (line: string) => logs.push(line), onRecovery: (recovery: JsonFileRecovery) => recoveries.push(recovery) };
  const corruptCopies = async () => (await readdir(dir)).filter((name) => name.startsWith("data.json.corrupt-")).sort();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-json-"));
    file = join(dir, "data.json");
    clock = Date.UTC(2026, 10, 14, 10, 0, 0);
    logs.length = 0;
    recoveries.length = 0;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports a missing file as missing, without creating anything", async () => {
    expect(await readJsonFile(file, hooks)).toEqual({ status: "missing" });
    expect(await readdir(dir)).toEqual([]);
    expect(recoveries).toEqual([]);
  });

  it("keeps the previous good content as .last-good each time it replaces the file, and leaves no temporary file", async () => {
    await writeJsonFileAtomic(file, { generation: 1 }, hooks);
    // Nothing was replaced yet, so there is nothing to keep.
    expect(await readdir(dir)).toEqual(["data.json"]);

    await writeJsonFileAtomic(file, { generation: 2 }, hooks);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ generation: 2 });
    expect(JSON.parse(await readFile(`${file}.last-good`, "utf8"))).toEqual({ generation: 1 });

    await writeJsonFileAtomic(file, { generation: 3 }, hooks);
    expect(JSON.parse(await readFile(`${file}.last-good`, "utf8"))).toEqual({ generation: 2 });
    expect((await readdir(dir)).sort()).toEqual(["data.json", "data.json.last-good"]);
  });

  it("restores the last good copy when the file is truncated, and keeps the damaged file", async () => {
    await writeJsonFileAtomic(file, { generation: 1 }, hooks);
    await writeJsonFileAtomic(file, { generation: 2 }, hooks);
    const good = await readFile(file, "utf8");
    await writeFile(file, good.slice(0, Math.floor(good.length / 2)));

    const content = await readJsonFile(file, hooks);

    expect(content).toMatchObject({ status: "ok", value: { generation: 1 } });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ generation: 1 });
    const [copy] = await corruptCopies();
    expect(copy).toMatch(/^data\.json\.corrupt-2026-11-14T10-00-\d\d\.000Z$/);
    expect(await readFile(join(dir, copy!), "utf8")).toBe(good.slice(0, Math.floor(good.length / 2)));
    expect(recoveries).toEqual([{ file, outcome: "restored", damagedCopy: join(dir, copy!), at: clock }]);
    expect(logs.join("\n")).toContain("data.json");
    expect(logs.join("\n")).toContain(copy);
    expect(logs.join("\n")).toMatch(/restored/i);
  });

  it("keeps both damaged copies when the file is damaged a second time", async () => {
    await writeJsonFileAtomic(file, { generation: 1 }, hooks);
    await writeJsonFileAtomic(file, { generation: 2 }, hooks);
    await writeFile(file, '{ "generation": ');
    await readJsonFile(file, hooks);
    await writeFile(file, "");
    const second = await readJsonFile(file, hooks);

    expect(second).toMatchObject({ status: "ok", value: { generation: 1 } });
    const copies = await corruptCopies();
    expect(copies).toHaveLength(2);
    expect(await readFile(join(dir, copies[0]!), "utf8")).toBe('{ "generation": ');
    expect(await readFile(join(dir, copies[1]!), "utf8")).toBe("");
    expect(recoveries.map((recovery) => recovery.outcome)).toEqual(["restored", "restored"]);
  });

  it("starts over when there is no usable last good copy, still keeping the damaged file", async () => {
    await writeFile(file, "{ not json");
    const content = await readJsonFile(file, hooks);

    expect(content.status).toBe("corrupt");
    const copies = await corruptCopies();
    expect(copies).toHaveLength(1);
    expect(await readFile(join(dir, copies[0]!), "utf8")).toBe("{ not json");
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(recoveries).toEqual([{ file, outcome: "reset", damagedCopy: join(dir, copies[0]!), at: clock }]);
    expect(logs.join("\n")).toContain(copies[0]);
  });

  it("does not trust a damaged last good copy", async () => {
    await writeFile(file, "{ not json");
    await writeFile(`${file}.last-good`, "also not json");
    expect((await readJsonFile(file, hooks)).status).toBe("corrupt");
    expect(recoveries.map((recovery) => recovery.outcome)).toEqual(["reset"]);
  });

  it("never overwrites a damaged copy, even when two are kept in the same millisecond", async () => {
    const frozen = { ...hooks, now: () => clock };
    await writeFile(file, "first damage");
    await readJsonFile(file, frozen);
    await writeFile(file, "second damage");
    await readJsonFile(file, frozen);

    const copies = await corruptCopies();
    expect(copies).toHaveLength(2);
    expect(await Promise.all(copies.map((name) => readFile(join(dir, name), "utf8")))).toEqual(["first damage", "second damage"]);
  });

  it(`keeps at most ${MAX_CORRUPT_COPIES} damaged copies, the newest ones`, async () => {
    for (let damage = 1; damage <= MAX_CORRUPT_COPIES + 2; damage += 1) {
      await writeFile(file, `damage ${damage}`);
      await readJsonFile(file, hooks);
    }
    const copies = await corruptCopies();
    expect(copies).toHaveLength(MAX_CORRUPT_COPIES);
    expect(await Promise.all(copies.map((name) => readFile(join(dir, name), "utf8")))).toEqual(["damage 3", "damage 4", "damage 5", "damage 6", "damage 7"]);
  });

  it("treats content of the wrong shape as damaged when the store says what it expects", async () => {
    const isValid = (value: unknown) => typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items);
    await writeJsonFileAtomic(file, { items: [1] }, { ...hooks, isValid });
    await writeJsonFileAtomic(file, { items: [1, 2] }, { ...hooks, isValid });
    await writeFile(file, "null");

    expect(await readJsonFile(file, { ...hooks, isValid })).toMatchObject({ status: "ok", value: { items: [1] } });
    expect(await corruptCopies()).toHaveLength(1);
  });

  it("keeps a damaged file before writing on top of it, and does not make it the last good copy", async () => {
    await writeJsonFileAtomic(file, { generation: 1 }, hooks);
    await writeJsonFileAtomic(file, { generation: 2 }, hooks);
    await writeFile(file, "damaged before a write");

    await writeJsonFileAtomic(file, { generation: 3 }, hooks);

    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ generation: 3 });
    expect(JSON.parse(await readFile(`${file}.last-good`, "utf8"))).toEqual({ generation: 1 });
    const copies = await corruptCopies();
    expect(copies).toHaveLength(1);
    expect(await readFile(join(dir, copies[0]!), "utf8")).toBe("damaged before a write");
  });

  it("keeps no last good copy for a cache, and starts it over when it is damaged", async () => {
    const cache = { ...hooks, lastGood: false };
    await writeJsonFileAtomic(file, { generation: 1 }, cache);
    await writeJsonFileAtomic(file, { generation: 2 }, cache);
    expect(await readdir(dir)).toEqual(["data.json"]);

    // Even with a last good copy lying around from before, a cache is fetched again rather than rolled back.
    await writeFile(`${file}.last-good`, JSON.stringify({ generation: 1 }));
    await writeFile(file, "{");
    expect((await readJsonFile(file, cache)).status).toBe("corrupt");
    expect(await corruptCopies()).toHaveLength(1);
  });

  it("moves aside a file that cannot be read at all", async () => {
    // A directory where the file should be: reading it fails with something other than "missing".
    await mkdir(file);
    const content = await readJsonFile(file, hooks);
    expect(content.status).toBe("corrupt");
    expect(await corruptCopies()).toHaveLength(1);
    await writeJsonFileAtomic(file, { generation: 1 }, hooks);
    expect(await readJsonFile(file, hooks)).toMatchObject({ status: "ok", value: { generation: 1 } });
  });
});
