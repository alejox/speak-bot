import type { Board, HealthResponse, ServerEvent } from "@speed-deck/core";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startDesktop, type RunningDesktop } from "../src/start-desktop";

/** No sponsor feed, so starting the desktop in a test never reaches the network. */
const OFFLINE_ENV = { SPEED_DECK_AD_FEED_URL: "" };

describe("recovering a damaged boards file", () => {
  let dir: string;
  let desktop: RunningDesktop | undefined;
  let logs: string[];

  const start = async () => {
    desktop = await startDesktop({ argv: ["--port", "0", "--host", "127.0.0.1", "--data-dir", dir], env: OFFLINE_ENV, log: (line) => logs.push(line) });
    return desktop;
  };
  const url = (path: string) => `http://127.0.0.1:${desktop!.port}${path}`;
  const health = async () => (await (await fetch(url("/api/health"))).json()) as HealthResponse;
  const boards = async () => (await (await fetch(url("/api/boards"))).json()) as Board[];
  const post = (path: string, body: unknown, method = "POST") => fetch(url(path), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const boardsFile = () => join(dir, "boards.json");
  const damagedCopies = async () => (await readdir(dir)).filter((name) => name.startsWith("boards.json.corrupt-")).sort();

  /** A first run, then two changes of the user's own: a renamed board, then a new key on it. */
  async function installWithChanges() {
    await start();
    const [voice] = await boards();
    await post(`/api/boards/${voice!.id}`, { name: "MY PHRASES" }, "PATCH");
    await post(`/api/boards/${voice!.id}/keys/14`, { action: { type: "voice.speak", text: "Latest phrase" } }, "PUT");
    await desktop!.close();
    desktop = undefined;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-recovery-"));
    logs = [];
  });

  afterEach(async () => {
    await desktop?.close();
    desktop = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("reports nothing on a healthy start", async () => {
    await installWithChanges();
    await start();
    expect((await health()).dataRecovery).toBeUndefined();
    expect(await damagedCopies()).toEqual([]);
  });

  it("restores the last good copy of a truncated file, keeps the damaged one, and says so until dismissed", async () => {
    await installWithChanges();
    const good = await readFile(boardsFile(), "utf8");
    await writeFile(boardsFile(), good.slice(0, Math.floor(good.length / 2)));

    await start();

    // The boards as they were before the last change: the user's board, not the default ones.
    expect((await boards()).some((board) => board.name === "MY PHRASES")).toBe(true);
    const [copy] = await damagedCopies();
    expect(await readFile(join(dir, copy!), "utf8")).toBe(good.slice(0, Math.floor(good.length / 2)));
    const { dataRecovery } = await health();
    expect(dataRecovery).toMatchObject({ file: "boards", outcome: "restored", damagedCopyPath: join(dir, copy!) });
    expect(typeof dataRecovery!.at).toBe("number");
    expect(logs.some((line) => line.includes("boards.json") && line.includes(copy!) && /restored/i.test(line))).toBe(true);

    // Still there after a restart, until the person dismisses it; then it stays away.
    await desktop!.close();
    await start();
    expect((await health()).dataRecovery).toMatchObject({ outcome: "restored" });

    const socket = new WebSocket(url("/ws").replace("http", "ws"));
    const events: ServerEvent[] = [];
    socket.on("message", (data) => events.push(JSON.parse(String(data)) as ServerEvent));
    await new Promise<void>((resolve) => socket.once("open", () => resolve()));
    expect((await post("/api/data-recovery/dismiss", {})).status).toBe(200);
    expect((await health()).dataRecovery).toBeUndefined();
    await expect.poll(() => events.map((event) => event.type)).toContain("data-recovery");
    socket.close();

    await desktop!.close();
    await start();
    expect((await health()).dataRecovery).toBeUndefined();
    expect(await damagedCopies()).toEqual([copy]);
  });

  it("keeps both damaged files when the boards file is damaged twice", async () => {
    await installWithChanges();
    const good = await readFile(boardsFile(), "utf8");
    await writeFile(boardsFile(), good.slice(0, Math.floor(good.length / 2)));
    await start();
    await desktop!.close();
    await writeFile(boardsFile(), "");
    await start();

    const copies = await damagedCopies();
    expect(copies).toHaveLength(2);
    expect((await readFile(join(dir, copies[0]!), "utf8")).length).toBeGreaterThan(0);
    expect(await readFile(join(dir, copies[1]!), "utf8")).toBe("");
    expect((await boards()).some((board) => board.name === "MY PHRASES")).toBe(true);
    expect((await health()).dataRecovery).toMatchObject({ outcome: "restored", damagedCopyPath: join(dir, copies[1]!) });
  });

  it("starts with the default boards when there is no last good copy, keeps the damaged file and says where", async () => {
    await writeFile(boardsFile(), '{ "version": 1, "boards": [ { "id": "mine", "na');

    await start();

    const [copy] = await damagedCopies();
    expect(await readFile(join(dir, copy!), "utf8")).toBe('{ "version": 1, "boards": [ { "id": "mine", "na');
    expect((await boards()).length).toBeGreaterThan(0);
    expect((await health()).dataRecovery).toMatchObject({ file: "boards", outcome: "defaults", damagedCopyPath: join(dir, copy!) });
    expect(logs.some((line) => line.includes(copy!) && /default|start(s|ing|ed)? over/i.test(line))).toBe(true);
  });

  it("recovers a damaged settings file the same way, without a notice", async () => {
    await start();
    await post("/api/settings", { rate: 1.5 }, "PUT");
    await post("/api/settings", { rate: 1.75 }, "PUT");
    await desktop!.close();
    await writeFile(join(dir, "settings.json"), "{");

    await start();

    expect(((await (await fetch(url("/api/settings"))).json()) as { rate: number }).rate).toBe(1.5);
    expect((await readdir(dir)).filter((name) => name.startsWith("settings.json.corrupt-"))).toHaveLength(1);
    expect((await health()).dataRecovery).toBeUndefined();
    expect(logs.some((line) => line.includes("settings.json") && /restored/i.test(line))).toBe(true);
  });
});
