import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { connect as connectTcp } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import type { DesktopSpeechSynthesizer } from "../src/adapters/tts/process-speech-synthesizer";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";

const silentSynthesizer: DesktopSpeechSynthesizer = {
  capabilities: { platform: "test", engine: "fake", supportsDeviceSelection: false },
  speak: async () => {},
  cancel: () => {},
  listVoices: async () => [],
  listDevices: async () => [],
};

/** Sends an HTTP request with explicit headers (fetch does not allow overriding Host). */
function requestWith(
  port: number,
  path: string,
  headers: Record<string, string>,
  method = "GET",
  body?: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.end(body);
  });
}

/** Resolves true when the WebSocket opens, false when the server refuses it. */
function openSocket(port: number, options: { origin?: string; host?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const headers = options.host ? { host: options.host } : undefined;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: options.origin, headers });
    socket.once("open", () => {
      socket.close();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Sends raw bytes and resolves with everything the server writes back before closing the socket. */
function rawRequest(port: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connectTcp(port, "127.0.0.1", () => socket.write(payload));
    let received = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (received += chunk));
    socket.on("close", () => resolve(received));
    socket.on("error", (error: NodeJS.ErrnoException) => (error.code === "ECONNRESET" ? resolve(received) : reject(error)));
    socket.setTimeout(2000, () => socket.destroy());
  });
}

describe("desktop server boundary", () => {
  let dir: string;
  let server: DesktopServer;
  let port: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speak-bot-boundary-"));
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer: silentSynthesizer,
      generateId: () => "id",
      now: () => 1000,
      hostname: "Streamer-PC",
      allowedHosts: ["speak.example.com"],
      pageHandler: async (_request, response) => {
        response.writeHead(200).end("page");
        return true;
      },
    });
    await server.listen(0, "127.0.0.1");
    port = (server.httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("survives a WebSocket upgrade with a malformed URL", async () => {
    await rawRequest(
      port,
      "GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
        "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
    );

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
  });

  it("rejects requests whose Host is a foreign domain name (DNS rebinding)", async () => {
    const json = { "content-type": "application/json" };
    expect(await requestWith(port, "/api/speak", { ...json, host: "evil.example:4545" }, "POST", '{"text":"hi"}')).toBe(403);
    expect(await requestWith(port, "/api/health", { host: "evil.example:4545" })).toBe(403);
    expect(await requestWith(port, "/", { host: "evil.example:4545" })).toBe(403);
    expect(await requestWith(port, "/overlay", { host: "localhost.evil.example" })).toBe(403);
  });

  it("accepts loopback, IP literals, the machine name and configured hosts", async () => {
    for (const host of [
      "localhost:4545",
      "127.0.0.1:4545",
      "[::1]:4545",
      "192.168.1.20:4545",
      "[fe80::1]:4545",
      "streamer-pc:4545",
      "Streamer-PC.local:4545",
      "speak.example.com",
    ]) {
      expect(await requestWith(port, "/api/health", { host }), host).toBe(200);
    }
  });

  it("accepts requests from an OBS dock page served by this desktop on 127.0.0.1", async () => {
    const dock = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
    const json = { ...dock, "content-type": "application/json" };
    expect(await requestWith(port, "/api/health", dock)).toBe(200);
    expect(await requestWith(port, "/api/boards", dock)).toBe(200);
    expect(await requestWith(port, "/api/stop", json, "POST", "{}")).toBe(200);
    expect(await requestWith(port, "/dock", dock)).toBe(200);
  });

  it("rejects requests whose Origin does not match the Host", async () => {
    expect(await requestWith(port, "/api/health", { host: "localhost:4545", origin: "http://evil.example" })).toBe(403);
    expect(await requestWith(port, "/api/health", { host: "localhost:4545", origin: "null" })).toBe(403);
    expect(await requestWith(port, "/api/health", { host: "localhost:4545", origin: "http://localhost:4545" })).toBe(200);
  });

  it("only lets same-origin pages open the event WebSocket", async () => {
    expect(await openSocket(port, { origin: "http://evil.example" })).toBe(false);
    expect(await openSocket(port, { host: "evil.example" })).toBe(false);
    expect(await openSocket(port, { origin: `http://127.0.0.1:${port}` })).toBe(true);
    expect(await openSocket(port, {})).toBe(true);
  });
});
