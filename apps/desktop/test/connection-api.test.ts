import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { NetworkInterfaceInfo } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFilePhraseRepository } from "../src/adapters/json-file-phrase-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiHandler } from "../src/server/api";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";

const wifi: NetworkInterfaceInfo = {
  address: "192.168.1.20",
  netmask: "255.255.255.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal: false,
  cidr: "192.168.1.20/24",
};

describe("GET /api/connection", () => {
  let dir: string;
  let server: DesktopServer;
  let port: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speak-bot-connection-"));
    server = createDesktopServer({
      repository: new JsonFilePhraseRepository(join(dir, "phrases.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer: {
        capabilities: { platform: "test", engine: "fake", supportsDeviceSelection: false },
        speak: async () => {},
        cancel: () => {},
        listVoices: async () => [],
        listDevices: async () => [],
      },
      generateId: () => "id",
      now: () => 1,
      networkInterfaces: () => ({ en0: [wifi] }),
    });
    await server.listen(0, "127.0.0.1");
    port = (server.httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("reports the actual port, the phone URLs and the OBS overlay URL", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/connection`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      port,
      lanUrls: [`http://192.168.1.20:${port}/`],
      overlayUrl: `http://localhost:${port}/overlay`,
      dockUrl: `http://127.0.0.1:${port}/dock`,
    });
  });

  it("is protected by the request guard like every other route", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/connection`, { headers: { origin: "http://evil.example" } });
    expect(response.status).toBe(403);
  });

  it("answers only clients on this computer", async () => {
    const handle = createApiHandler({
      repository: undefined as never,
      settings: undefined as never,
      synthesizer: undefined as never,
      broadcast: () => {},
      generateId: () => "id",
      now: () => 1,
      instanceId: "test",
      networkInterfaces: () => ({ en0: [wifi] }),
    });
    const ask = async (remoteAddress: string) => {
      let status = 0;
      const request = { method: "GET", socket: { remoteAddress, localPort: 4545 } } as unknown as IncomingMessage;
      const response = {
        headersSent: false,
        writeHead: (code: number) => {
          status = code;
        },
        end: () => {},
      } as unknown as ServerResponse;
      await handle(request, response, "/api/connection");
      return status;
    };

    expect(await ask("127.0.0.1")).toBe(200);
    expect(await ask("127.12.0.3")).toBe(200);
    expect(await ask("::1")).toBe(200);
    expect(await ask("::ffff:127.0.0.1")).toBe(200);
    expect(await ask("192.168.1.30")).toBe(403);
    expect(await ask("::ffff:192.168.1.30")).toBe(403);
    expect(await ask("fe80::1")).toBe(403);
  });
});
