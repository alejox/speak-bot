import { DEFAULT_DECK_BOARD_ID, type Board, type ServerEvent } from "@speed-deck/core";
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

describe("folders and multi-actions API", () => {
  let dir: string;
  let server: DesktopServer;
  let synthesizer: FakeSynthesizer;
  let baseUrl: string;
  let port: number;
  let settingsChanges: unknown[];
  let repository: JsonFileBoardRepository;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-folders-api-"));
    synthesizer = new FakeSynthesizer();
    settingsChanges = [];
    repository = new JsonFileBoardRepository(join(dir, "boards.json"));
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
      const event = JSON.parse(String(data)) as ServerEvent;
      // Settings changes are covered by the settings tests.
      if (event.type === "settings-changed") return;
      events.push(event);
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

  describe("POST /api/boards/:id/folders", () => {
    it("creates a folder and the key that opens it, and deleting the key deletes the folder", async () => {
      const events = await listen();
      const created = await send(`/api/boards/${DEFAULT_DECK_BOARD_ID}/folders`, "POST", { slot: 5, label: "Escenas", icon: "folder" });
      expect(created.status).toBe(201);
      const { folder, key } = (await created.json()) as { folder: Board; key: unknown };
      expect(folder).toMatchObject({ name: "Escenas", kind: "deck", parentId: DEFAULT_DECK_BOARD_ID, keys: [{ slot: 0, action: { type: "nav.folderBack" } }] });
      expect(key).toEqual({ slot: 5, label: "Escenas", icon: "folder", action: { type: "nav.openFolder", folderId: folder.id } });
      expect((await events.next(1))[0]).toMatchObject({ type: "boards-changed" });
      expect((await boards()).some((board) => board.id === folder.id)).toBe(true);

      expect((await send(`/api/boards/${DEFAULT_DECK_BOARD_ID}/keys/5`, "DELETE")).status).toBe(204);
      expect((await boards()).some((board) => board.id === folder.id)).toBe(false);
      events.close();
    });

    it("refuses a used slot, a missing board and a missing name", async () => {
      expect((await send(`/api/boards/${DEFAULT_DECK_BOARD_ID}/folders`, "POST", { slot: 0, label: "X" })).status).toBe(409);
      expect((await send("/api/boards/missing/folders", "POST", { slot: 5, label: "X" })).status).toBe(404);
      expect((await send(`/api/boards/${DEFAULT_DECK_BOARD_ID}/folders`, "POST", { slot: 5 })).status).toBe(400);
    });
  });

  describe("multi-actions", () => {
    const sequence = {
      type: "system.multiAction",
      steps: [{ action: { type: "obs.toggleRecord" } }, { action: { type: "system.openApp", appId: "/Applications/None.app" }, delayMs: 10 }],
    };

    it("runs every step, reports the ones that failed and says which key ran", async () => {
      const events = await listen();
      const key = { boardId: DEFAULT_DECK_BOARD_ID, slot: 7 };
      const response = await send("/api/actions/execute", "POST", { action: sequence, key });
      expect(response.status).toBe(202);
      const [start, end] = await events.next(2);
      expect(start).toMatchObject({ type: "multi-action", key, state: "start" });
      // There is no OBS and no application launcher here, so both steps fail and are reported.
      expect(end).toMatchObject({ type: "multi-action", key, state: "end", failures: [{ index: 0, type: "obs.toggleRecord" }, { index: 1, type: "system.openApp" }] });
      events.close();
    });

    it("refuses a key that is not a board and a slot", async () => {
      for (const key of [{ boardId: "", slot: 1 }, { boardId: "deck", slot: -1 }, "deck:1"]) {
        expect((await send("/api/actions/execute", "POST", { action: sequence, key })).status, JSON.stringify(key)).toBe(400);
      }
    });
  });
});
