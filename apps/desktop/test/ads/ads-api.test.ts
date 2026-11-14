import { MAX_ADS_DEVICE_ID_LENGTH, MAX_ADS_DEVICE_NAME_LENGTH, type ServerEvent } from "@speed-deck/core";
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
import { AdsGrants } from "../../src/ads/ads-grants";
import { createApiHandler } from "../../src/server/api";
import { createDesktopServer, type DesktopServer } from "../../src/server/create-server";
import { createRequestGuard } from "../../src/server/request-guard";
import { FakeSynthesizer } from "../fake-synthesizer";

const REPORT = { deviceId: "device-pixel-0001", deviceName: "Pixel 8", entitlement: "owned" };

describe("ads API", () => {
  let dir: string;
  let server: DesktopServer;
  let baseUrl: string;
  let adsGrants: AdsGrants;

  const settings = () => new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true });
  const start = async (grants: AdsGrants | undefined) => {
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: settings(),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 1,
      adsGrants: grants,
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-ads-api-"));
    adsGrants = new AdsGrants({ file: join(dir, "ads-grants.json"), now: () => 7 });
    await start(adsGrants);
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const state = async () => (await fetch(`${baseUrl}/api/ads`)).json();
  const report = (body: unknown, init: RequestInit = {}) =>
    fetch(`${baseUrl}/api/ads/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...init });

  it("removes ads when a phone reports the purchase and brings them back after a refund, broadcasting each change", async () => {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws`);
    const events: ServerEvent[] = [];
    socket.on("message", (data) => events.push(JSON.parse(String(data)) as ServerEvent));
    await new Promise((resolve) => socket.once("open", resolve));

    expect(await state()).toEqual({ adsFree: false });

    const granted = await report(REPORT);
    expect(granted.status).toBe(200);
    expect(await granted.json()).toEqual({ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 7 } });
    expect(await state()).toEqual({ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 7 } });

    // Reporting again (each connection) and a pending or unknown answer change nothing.
    await report(REPORT);
    expect(await (await report({ ...REPORT, entitlement: "unknown" })).json()).toMatchObject({ adsFree: true });
    expect(await (await report({ ...REPORT, entitlement: "pending" })).json()).toMatchObject({ adsFree: true });

    expect(await (await report({ ...REPORT, entitlement: "not-owned" })).json()).toEqual({ adsFree: false });
    expect(await state()).toEqual({ adsFree: false });

    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.close();
    const changes = events.filter((event) => event.type === "ads-changed");
    expect(changes.map((event) => event.type === "ads-changed" && event.ads)).toEqual([{ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 7 } }, { adsFree: false }]);
    // The id only identifies the phone to this computer; other clients never see it.
    expect(JSON.stringify(events)).not.toContain(REPORT.deviceId);
  });

  it("refuses reports with a missing, mistyped or oversized field, and grants nothing", async () => {
    const invalid: unknown[] = [
      {},
      [],
      { ...REPORT, deviceId: undefined },
      { ...REPORT, deviceId: 5 },
      { ...REPORT, deviceId: "short" },
      { ...REPORT, deviceId: "has spaces in the id" },
      { ...REPORT, deviceId: "../../etc/passwd-0000" },
      { ...REPORT, deviceId: "a".repeat(MAX_ADS_DEVICE_ID_LENGTH + 1) },
      { ...REPORT, deviceName: undefined },
      { ...REPORT, deviceName: 5 },
      { ...REPORT, deviceName: "   " },
      { ...REPORT, deviceName: "Pixel\u0000 8" },
      { ...REPORT, deviceName: "n".repeat(MAX_ADS_DEVICE_NAME_LENGTH + 1) },
      { ...REPORT, entitlement: undefined },
      { ...REPORT, entitlement: "gold" },
      { ...REPORT, entitlement: true },
    ];
    for (const body of invalid) {
      const response = await report(body);
      expect({ body, status: response.status }).toEqual({ body, status: 400 });
    }
    expect(await state()).toEqual({ adsFree: false });
  });

  it("accepts the longest id and name, trimming the name", async () => {
    const response = await report({ deviceId: "a".repeat(MAX_ADS_DEVICE_ID_LENGTH), deviceName: `  ${"n".repeat(MAX_ADS_DEVICE_NAME_LENGTH)}  `, entitlement: "owned" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ adsFree: true, grantedBy: { deviceName: "n".repeat(MAX_ADS_DEVICE_NAME_LENGTH), grantedAt: 7 } });
  });

  it("only takes JSON bodies of a bounded size", async () => {
    expect((await report(REPORT, { headers: { "content-type": "text/plain" } })).status).toBe(415);
    expect((await report({ ...REPORT, padding: "x".repeat(20_000) })).status).toBe(413);
  });

  it("takes the report from a paired phone on the network, not only from this computer", async () => {
    const handle = createApiHandler({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: settings(),
      synthesizer: new FakeSynthesizer(),
      broadcast: () => {},
      generateId: () => "id",
      now: () => 1,
      instanceId: "test",
      adsGrants,
    });
    const payload = JSON.stringify(REPORT);
    const headers = { host: "192.168.1.20:4545", origin: "http://192.168.1.20:4545", "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) };
    const request = Object.assign(Readable.from([Buffer.from(payload)]), {
      method: "POST",
      headers,
      socket: { remoteAddress: "192.168.1.30", localPort: 4545 },
    }) as unknown as IncomingMessage;
    // The server's guard lets a page served from the computer's LAN address through, and no other website.
    const isAllowed = createRequestGuard({ hostname: "studio-mac" });
    expect(isAllowed(request)).toBe(true);
    expect(isAllowed({ headers: { ...headers, origin: "https://evil.example" } } as unknown as IncomingMessage)).toBe(false);

    let status = 0;
    let text = "";
    const response = {
      headersSent: false,
      writeHead: (code: number) => void (status = code),
      end: (chunk?: string) => void (text = chunk ?? ""),
    } as unknown as ServerResponse;
    await handle(request, response, "/api/ads/report");
    expect({ status, body: JSON.parse(text) as unknown }).toEqual({ status: 200, body: { adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 7 } } });
    expect((await adsGrants.status()).adsFree).toBe(true);
  });

  it("shows ads and records nothing without a grants store", async () => {
    await server.close();
    await start(undefined);
    expect(await state()).toEqual({ adsFree: false });
    expect(await (await report(REPORT)).json()).toEqual({ adsFree: false });
  });

  it("no longer has the key endpoints of older versions", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/license`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
      expect({ method, status: response.status }).toEqual({ method, status: 404 });
    }
  });
});
