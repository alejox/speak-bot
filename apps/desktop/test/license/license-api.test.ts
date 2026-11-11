import {
  InvalidLicenseKeyError,
  LicenseActivationLimitError,
  LicenseServiceUnavailableError,
  WrongLicenseProductError,
  type LicenseService,
  type ServerEvent,
} from "@speed-deck/core";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JsonFileBoardRepository } from "../../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../../src/adapters/json-file-settings-store";
import { JsonFileLicenseStore } from "../../src/license/json-file-license-store";
import { LicenseManager } from "../../src/license/license-manager";
import { createApiHandler } from "../../src/server/api";
import { createDesktopServer, type DesktopServer } from "../../src/server/create-server";
import { FakeSynthesizer } from "../fake-synthesizer";

const KEY = "38B1460A-5104-4067-A91D-77B872934D51";

class ScriptedLicenseService implements LicenseService {
  activateError: Error | undefined;
  async activate() {
    if (this.activateError) throw this.activateError;
    return { instanceId: "inst-1" };
  }
  async validate() {
    return "valid" as const;
  }
  async deactivate() {}
}

describe("license API", () => {
  let dir: string;
  let server: DesktopServer;
  let baseUrl: string;
  let service: ScriptedLicenseService;
  let license: LicenseManager;

  const settings = () => new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-license-api-"));
    service = new ScriptedLicenseService();
    license = new LicenseManager({
      store: new JsonFileLicenseStore(join(dir, "license.json")),
      service,
      instanceName: "Mac",
      checkoutUrl: "https://store.example/buy",
      now: () => 7,
      every: () => () => {},
    });
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: settings(),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 1,
      license,
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const send = (method: string, body?: unknown) =>
    fetch(`${baseUrl}/api/license`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("reports the status, activates and removes a key, broadcasting each change", async () => {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`);
    const events: ServerEvent[] = [];
    socket.on("message", (data) => events.push(JSON.parse(String(data)) as ServerEvent));
    await new Promise((resolve) => socket.once("open", resolve));

    expect(await (await send("GET")).json()).toEqual({ adsFree: false, canActivate: true, checkoutUrl: "https://store.example/buy" });

    const activated = await send("PUT", { key: KEY });
    expect(activated.status).toBe(200);
    const body = await activated.text();
    expect(JSON.parse(body)).toEqual({ adsFree: true, canActivate: true, maskedKey: "••••4D51", lastValidatedAt: 7, checkoutUrl: "https://store.example/buy" });
    expect(body).not.toContain(KEY);

    const removed = await send("DELETE");
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ adsFree: false, canActivate: true, checkoutUrl: "https://store.example/buy" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.close();
    const changes = events.filter((event) => event.type === "license-changed");
    expect(changes.map((event) => event.type === "license-changed" && event.license.adsFree)).toEqual([true, false]);
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("explains refused activations with codes", async () => {
    const cases: Array<[Error, number, string]> = [
      [new InvalidLicenseKeyError(), 400, "license-invalid"],
      [new WrongLicenseProductError(), 400, "license-wrong-product"],
      [new LicenseActivationLimitError(), 409, "license-limit"],
      [new LicenseServiceUnavailableError(), 503, "license-offline"],
    ];
    for (const [error, status, code] of cases) {
      service.activateError = error;
      const response = await send("PUT", { key: KEY });
      expect({ code, status: response.status, body: await response.json() }).toMatchObject({ code, status, body: { code } });
    }
  });

  it("validates the key field", async () => {
    for (const body of [{}, { key: 5 }, { key: "   " }, { key: "x".repeat(201) }]) {
      expect((await send("PUT", body)).status).toBe(400);
    }
  });

  it("only lets this computer activate or remove the license", async () => {
    const handle = createApiHandler({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: settings(),
      synthesizer: new FakeSynthesizer(),
      broadcast: () => {},
      generateId: () => "id",
      now: () => 1,
      instanceId: "test",
      license,
    });
    const ask = async (method: string) => {
      const payload = JSON.stringify({ key: KEY });
      const request = Object.assign(Readable.from([Buffer.from(payload)]), {
        method,
        headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) },
        socket: { remoteAddress: "192.168.1.30", localPort: 4545 },
      }) as unknown as IncomingMessage;
      let status = 0;
      let text = "";
      const response = {
        headersSent: false,
        writeHead: (code: number) => {
          status = code;
        },
        end: (chunk?: string) => {
          text = chunk ?? "";
        },
      } as unknown as ServerResponse;
      await handle(request, response, "/api/license");
      return { status, body: text === "" ? undefined : (JSON.parse(text) as Record<string, unknown>) };
    };
    expect(await ask("PUT")).toMatchObject({ status: 403, body: { code: "loopback-only" } });
    expect(await ask("DELETE")).toMatchObject({ status: 403, body: { code: "loopback-only" } });
    expect(await ask("GET")).toMatchObject({ status: 200, body: { adsFree: false } });
    expect((await license.status()).adsFree).toBe(false);
  });

  it("reports licensing as unavailable without a license manager", async () => {
    await server.close();
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: settings(),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 1,
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
    expect(await (await send("GET")).json()).toEqual({ adsFree: false, canActivate: false });
    const response = await send("PUT", { key: KEY });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "license-disabled" });
  });
});
