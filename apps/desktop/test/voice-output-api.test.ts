import type { OverlayCommand, ServerEvent } from "@speed-deck/core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";
import { OverlayAudio } from "../src/server/overlay-audio";
import { FakeSynthesizer } from "./fake-synthesizer";

describe("voice output through the OBS overlay", () => {
  let dir: string;
  let server: DesktopServer;
  let synthesizer: FakeSynthesizer;
  let overlayAudio: OverlayAudio;
  let baseUrl: string;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-voice-"));
    synthesizer = new FakeSynthesizer();
    overlayAudio = new OverlayAudio({ dir: join(dir, "clips"), now: () => 1 });
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer,
      overlayAudio,
      generateId: () => "id",
      now: () => 1,
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await server.close();
    await overlayAudio.close();
    await rm(dir, { recursive: true, force: true });
  });

  const put = (body: unknown) =>
    fetch(`${baseUrl}/api/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function open(path: string) {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}${path}`);
    sockets.push(socket);
    const messages: Array<ServerEvent | OverlayCommand> = [];
    socket.on("message", (data) => messages.push(JSON.parse(String(data)) as ServerEvent | OverlayCommand));
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    const waitFor = async (match: (message: ServerEvent | OverlayCommand) => boolean) => {
      for (let tries = 0; tries < 200; tries += 1) {
        const found = messages.find(match);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error("message never arrived");
    };
    return { socket, messages, waitFor };
  }

  const status = async () => (await (await fetch(`${baseUrl}/api/voice/status`)).json()) as { overlayConnected: boolean };

  it("validates and saves the voice output, and passes it to the speech engine", async () => {
    expect((await put({ voiceOutput: "loud" })).status).toBe(400);
    expect(await (await put({ voiceOutput: "obs" })).json()).toMatchObject({ voiceOutput: "obs" });

    await fetch(`${baseUrl}/api/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Hola" }) });
    expect(synthesizer.spoken[0]!.options).toMatchObject({ output: "obs" });
  });

  it("reports whether an overlay is connected, to the status route and to every client", async () => {
    expect(await status()).toEqual({ overlayConnected: false });
    const app = await open("/ws");
    expect(await status()).toEqual({ overlayConnected: false });

    const overlay = await open("/ws?client=overlay");
    await app.waitFor((message) => message.type === "overlay-audio" && message.connected);
    expect(await status()).toEqual({ overlayConnected: true });

    overlay.socket.close();
    await app.waitFor((message) => message.type === "overlay-audio" && !message.connected);
    expect(await status()).toEqual({ overlayConnected: false });
  });

  it("sends clips only to overlays, serves the WAV while it plays and follows the overlay's reports", async () => {
    const app = await open("/ws");
    const overlay = await open("/ws?client=overlay");
    await app.waitFor((message) => message.type === "overlay-audio");

    const file = await overlayAudio.reserve("wav");
    await writeFile(file, "RIFF-fake-wav");
    let started = false;
    const running = overlayAudio.play(file, () => (started = true));
    const clip = await overlay.waitFor((message) => message.type === "voice-clip");
    if (clip.type !== "voice-clip") throw new Error("unexpected");

    const served = await fetch(`${baseUrl}${clip.url}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("audio/wav");
    expect(await served.text()).toBe("RIFF-fake-wav");
    expect((await fetch(`${baseUrl}/api/voice/clips/${"0".repeat(32)}.wav`)).status).toBe(404);
    expect((await fetch(`${baseUrl}${clip.url}`, { headers: { origin: "http://evil.example" } })).status).toBe(403);

    overlay.socket.send(JSON.stringify({ type: "clip-started", id: clip.id }));
    overlay.socket.send(JSON.stringify({ type: "clip-ended", id: clip.id }));
    expect((await running.result).code).toBe(0);
    expect(started).toBe(true);
    expect((await fetch(`${baseUrl}${clip.url}`)).status).toBe(404);
    expect(app.messages.some((message) => message.type === "voice-clip")).toBe(false);
  });

  it("ignores clip reports from clients that are not overlays", async () => {
    const overlay = await open("/ws?client=overlay");
    const app = await open("/ws");
    const file = await overlayAudio.reserve("wav");
    await writeFile(file, "RIFF");
    const running = overlayAudio.play(file, () => {});
    const clip = await overlay.waitFor((message) => message.type === "voice-clip");
    if (clip.type !== "voice-clip") throw new Error("unexpected");
    app.socket.send(JSON.stringify({ type: "clip-ended", id: clip.id }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(overlayAudio.clipFile(`${clip.id}.wav`)).toBe(file);
    running.kill();
    await overlay.waitFor((message) => message.type === "voice-clip-stop");
  });
});
