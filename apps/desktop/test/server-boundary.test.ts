import { mkdtemp, rm } from "node:fs/promises";
import { connect as connectTcp } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFilePhraseRepository } from "../src/adapters/json-file-phrase-repository";
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
      repository: new JsonFilePhraseRepository(join(dir, "phrases.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "" }),
      synthesizer: silentSynthesizer,
      generateId: () => "id",
      now: () => 1000,
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
});
