import { DEFAULT_BOARD_ID, MAX_BOARDS, type Board, type ServerEvent } from "@speed-deck/core";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { prepareBoards } from "../src/adapters/board-migration";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";
import { FakeSynthesizer } from "./fake-synthesizer";

describe("boards and actions API", () => {
  let dir: string;
  let server: DesktopServer;
  let synthesizer: FakeSynthesizer;
  let baseUrl: string;
  let port: number;
  let settingsChanges: unknown[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-boards-api-"));
    synthesizer = new FakeSynthesizer();
    settingsChanges = [];
    const repository = new JsonFileBoardRepository(join(dir, "boards.json"));
    await prepareBoards(repository, { legacyPhrasesFile: join(dir, "phrases.json"), language: "es" });
    let id = 0;
    server = createDesktopServer({
      repository,
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer,
      generateId: () => `id-${++id}`,
      now: () => 1000,
      hostname: "test-machine",
      onSettingsChanged: (settings) => settingsChanges.push(settings),
    });
    await server.listen(0, "127.0.0.1");
    port = (server.httpServer.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const send = (path: string, method: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  const boards = async () => (await (await fetch(`${baseUrl}/api/boards`)).json()) as Board[];
  const execute = (action: unknown) => send("/api/actions/execute", "POST", { action });

  async function listen(): Promise<{ next: (count: number) => Promise<ServerEvent[]>; close: () => void }> {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`);
    const events: ServerEvent[] = [];
    const waiters: Array<() => void> = [];
    socket.on("message", (data) => {
      events.push(JSON.parse(String(data)) as ServerEvent);
      for (const waiter of waiters.splice(0)) waiter();
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    return {
      next: async (count) => {
        while (events.length < count) await new Promise<void>((resolve) => waiters.push(resolve));
        return events.slice(0, count);
      },
      close: () => socket.close(),
    };
  }

  it("lists the communication board on first run", async () => {
    const [board] = await boards();
    expect(board).toMatchObject({ id: DEFAULT_BOARD_ID, name: "Comunicación", columns: 5, rows: 3 });
    expect(board!.keys[0]).toEqual({ slot: 0, action: { type: "voice.speak", text: "Hola" } });
  });

  it("creates, renames and deletes boards, broadcasting boards-changed, but keeps the last one", async () => {
    const client = await listen();
    const created = await send("/api/boards", "POST", { name: " OBS " });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: "id-1", name: "OBS", columns: 5, rows: 3, keys: [] });
    expect((await client.next(1))[0]).toEqual({ type: "boards-changed", at: 1000 });

    const renamed = await send("/api/boards/id-1", "PATCH", { name: "Escenas" });
    expect(await renamed.json()).toMatchObject({ id: "id-1", name: "Escenas" });
    expect((await boards()).map((b) => b.name)).toEqual(["Comunicación", "Escenas"]);

    expect((await send(`/api/boards/${DEFAULT_BOARD_ID}`, "DELETE")).status).toBe(204);
    const last = await send("/api/boards/id-1", "DELETE");
    expect(last.status).toBe(409);
    expect(await last.json()).toMatchObject({ code: "last-board" });
    expect((await client.next(3)).map((e) => e.type)).toEqual(["boards-changed", "boards-changed", "boards-changed"]);
    client.close();
  });

  it("sets, overwrites, clears and moves keys", async () => {
    const path = `/api/boards/${DEFAULT_BOARD_ID}/keys`;
    const set = await send(`${path}/20`, "PUT", { label: "Main", icon: "scene", color: "#00FF00", action: { type: "obs.switchScene", sceneName: "Main" } });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ slot: 20, label: "Main", icon: "scene", color: "#00ff00", action: { type: "obs.switchScene", sceneName: "Main" } });

    const occupied = await send(`${path}/0`, "PUT", { action: { type: "voice.stop" } });
    expect(occupied.status).toBe(409);
    expect(await occupied.json()).toMatchObject({ code: "slot-occupied" });
    expect((await send(`${path}/0`, "PUT", { action: { type: "voice.stop" }, replace: true })).status).toBe(200);

    const moved = await send(`${path}/move`, "POST", { from: 20, to: 0 });
    expect(moved.status).toBe(200);
    const keys = ((await moved.json()) as Board).keys;
    expect(keys.find((key) => key.slot === 0)!.action.type).toBe("obs.switchScene");
    expect(keys.find((key) => key.slot === 20)!.action.type).toBe("voice.stop");

    expect((await send(`${path}/20`, "DELETE")).status).toBe(204);
    expect((await boards())[0]!.keys.some((key) => key.slot === 20)).toBe(false);
    const missing = await send(`${path}/move`, "POST", { from: 21, to: 0 });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "key-not-found" });
  });

  it("restores the default board in the requested language", async () => {
    await send(`/api/boards/${DEFAULT_BOARD_ID}/keys/0`, "DELETE");
    const restored = await send("/api/boards/restore-default", "POST", { language: "en" });
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ id: DEFAULT_BOARD_ID, name: "Communication" });
    expect((await boards())[0]!.keys[0]!.action).toEqual({ type: "voice.speak", text: "Hello" });
    expect((await send("/api/boards/restore-default", "POST", { language: "fr" })).status).toBe(400);
  });

  it("answers 409 board-limit when restoring the default board would exceed the limit", async () => {
    for (let index = 0; index < MAX_BOARDS - 1; index += 1) expect((await send("/api/boards", "POST", { name: `B${index}` })).status).toBe(201);
    expect((await send(`/api/boards/${DEFAULT_BOARD_ID}`, "DELETE")).status).toBe(204);
    expect((await send("/api/boards", "POST", { name: "Last" })).status).toBe(201);

    const restored = await send("/api/boards/restore-default", "POST", { language: "es" });
    expect(restored.status).toBe(409);
    expect(await restored.json()).toMatchObject({ code: "board-limit" });
    expect(await boards()).toHaveLength(MAX_BOARDS);
  });

  it("validates input and reports unknown boards", async () => {
    const cases: Array<[string, string, unknown, number, string?]> = [
      ["/api/boards", "POST", { name: "" }, 400, "invalid-board"],
      ["/api/boards", "POST", { name: "x".repeat(41) }, 400, "invalid-board"],
      ["/api/boards", "POST", "{ broken", 400],
      ["/api/boards", "POST", [], 400],
      ["/api/boards/missing", "PATCH", { name: "x" }, 404, "board-not-found"],
      ["/api/boards/missing", "DELETE", undefined, 404, "board-not-found"],
      ["/api/boards/missing/keys/0", "PUT", { action: { type: "voice.stop" } }, 404, "board-not-found"],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/1500`, "PUT", { action: { type: "voice.stop" } }, 400, "invalid-board"],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/abc`, "PUT", { action: { type: "voice.stop" } }, 400],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/30`, "PUT", { action: { type: "shell.run" } }, 400, "invalid-board"],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/30`, "PUT", { label: "x".repeat(41), action: { type: "voice.stop" } }, 400, "invalid-board"],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/30`, "PUT", { color: "red", action: { type: "voice.stop" } }, 400, "invalid-board"],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/30`, "PUT", { icon: "nope", action: { type: "voice.stop" } }, 400, "invalid-board"],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/30`, "PUT", { action: { type: "voice.stop" }, replace: "yes" }, 400],
      [`/api/boards/${DEFAULT_BOARD_ID}/keys/move`, "POST", { from: 0 }, 400, "invalid-board"],
      ["/api/boards/restore-default", "POST", {}, 400],
      ["/api/boards", "PUT", {}, 404],
    ];
    for (const [path, method, body, status, code] of cases) {
      const response = await send(path, method, body);
      expect({ path, method, status: response.status }).toEqual({ path, method, status });
      const json = (await response.json()) as { error: string; code?: string };
      expect(json.error).toEqual(expect.any(String));
      if (code) expect(json.code).toBe(code);
    }
  });

  it("requires a JSON content type for every board mutation", async () => {
    for (const [path, method] of [
      ["/api/boards", "POST"],
      ["/api/boards/communication", "PATCH"],
      ["/api/boards/communication/keys/40", "PUT"],
      ["/api/boards/communication/keys/move", "POST"],
      ["/api/boards/restore-default", "POST"],
      ["/api/actions/execute", "POST"],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, { method, body: JSON.stringify({ name: "x" }) });
      expect({ path, status: response.status }).toEqual({ path, status: 415 });
    }
  });

  it("rejects board requests from foreign hosts and origins", async () => {
    const status = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const request = httpRequest({ host: "127.0.0.1", port, path: "/api/boards", method: "GET", headers }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        request.on("error", reject);
        request.end();
      });
    expect(await status({ host: "evil.example" })).toBe(403);
    expect(await status({ host: `127.0.0.1:${port}`, origin: "http://evil.example" })).toBe(403);
    expect(await status({ host: `127.0.0.1:${port}` })).toBe(200);
  });

  describe("POST /api/actions/execute", () => {
    it("speaks, repeats and stops on the desktop", async () => {
      const nothing = await execute({ type: "voice.repeat" });
      expect(nothing.status).toBe(404);
      expect(await nothing.json()).toMatchObject({ code: "nothing-to-repeat" });

      expect((await execute({ type: "voice.speak", text: " Hola " })).status).toBe(202);
      synthesizer.finishCurrent();
      expect((await execute({ type: "voice.repeat" })).status).toBe(202);
      expect((await execute({ type: "voice.stop" })).status).toBe(200);
      expect(synthesizer.spoken.map((entry) => entry.text)).toEqual(["Hola", "Hola"]);
      expect(synthesizer.cancelCount).toBe(1);
    });

    it("clears and toggles captions, telling every client", async () => {
      const client = await listen();
      expect(await (await execute({ type: "captions.clear" })).json()).toEqual({ ok: true });
      const hidden = await execute({ type: "captions.toggle" });
      expect(await hidden.json()).toEqual({ ok: true, captionsVisible: false });
      expect(await (await execute({ type: "captions.toggle" })).json()).toEqual({ ok: true, captionsVisible: true });
      expect(await client.next(3)).toEqual([
        { type: "caption-clear", at: 1000 },
        { type: "captions-visibility", visible: false, at: 1000 },
        { type: "captions-visibility", visible: true, at: 1000 },
      ]);
      client.close();
    });

    it("switches the voice language and reports the settings change", async () => {
      expect(await (await execute({ type: "voice.toggleLanguage" })).json()).toEqual({ ok: true, voiceLanguage: "en" });
      expect(await (await execute({ type: "voice.toggleLanguage" })).json()).toEqual({ ok: true, voiceLanguage: "es" });
      expect(settingsChanges).toMatchObject([{ voiceLanguage: "en" }, { voiceLanguage: "es" }]);
    });

    it("refuses navigation actions, which each client runs itself", async () => {
      for (const action of [{ type: "nav.nextPage" }, { type: "nav.prevPage" }, { type: "nav.goToPage", page: 2 }, { type: "nav.goToBoard", boardId: "x" }]) {
        const response = await execute(action);
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "client-action" });
      }
    });

    it("rejects invalid actions without speaking", async () => {
      for (const body of [{}, { action: { type: "voice.speak", text: "" } }, { action: { type: "exec" } }, { action: "voice.stop" }]) {
        const response = await send("/api/actions/execute", "POST", body);
        expect(response.status).toBe(400);
      }
      expect(synthesizer.spoken).toEqual([]);
    });
  });
});
