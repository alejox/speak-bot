import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdsGrants, MAX_ADS_GRANTS } from "../../src/ads/ads-grants";

const PIXEL = { deviceId: "device-pixel-0001", deviceName: "Pixel 8" };
const GALAXY = { deviceId: "device-galaxy-0002", deviceName: "Galaxy S24" };

describe("AdsGrants", () => {
  let dir: string;
  let file: string;
  let clock: number;
  const grants = () => new AdsGrants({ file, now: () => clock });
  const stored = async () => JSON.parse(await readFile(file, "utf8")) as unknown;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-ads-grants-"));
    file = join(dir, "ads-grants.json");
    clock = 100;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("shows ads until a phone reports that it owns remove ads, and remembers the grant", async () => {
    const ads = grants();
    expect(await ads.status()).toEqual({ adsFree: false });

    expect(await ads.report({ ...PIXEL, entitlement: "owned" })).toEqual({ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 100 } });
    expect(await stored()).toEqual({ grants: [{ deviceId: "device-pixel-0001", deviceName: "Pixel 8", grantedAt: 100 }] });

    // The phone is off or away: a new process still finds the grant.
    expect(await grants().status()).toEqual({ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 100 } });
  });

  it("keeps one grant per device when it reports again, with its first date and its newest name", async () => {
    const ads = grants();
    await ads.report({ ...PIXEL, entitlement: "owned" });
    clock = 200;
    await ads.report({ ...PIXEL, entitlement: "owned" });
    expect(await stored()).toEqual({ grants: [{ ...PIXEL, grantedAt: 100 }] });

    await ads.report({ ...PIXEL, deviceName: "Ana's Pixel", entitlement: "owned" });
    expect(await stored()).toEqual({ grants: [{ deviceId: PIXEL.deviceId, deviceName: "Ana's Pixel", grantedAt: 100 }] });
  });

  it("removes a grant only when its own device reports not-owned, and stays ad-free while another grant exists", async () => {
    const ads = grants();
    await ads.report({ ...PIXEL, entitlement: "owned" });
    clock = 200;
    await ads.report({ ...GALAXY, entitlement: "owned" });
    expect(await ads.status()).toEqual({ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 100 } });

    expect(await ads.report({ ...PIXEL, entitlement: "not-owned" })).toEqual({ adsFree: true, grantedBy: { deviceName: "Galaxy S24", grantedAt: 200 } });
    expect(await ads.report({ ...GALAXY, entitlement: "not-owned" })).toEqual({ adsFree: false });
    expect(await stored()).toEqual({ grants: [] });
  });

  it("keeps the grant when the phone does not know yet or the payment is pending", async () => {
    const ads = grants();
    await ads.report({ ...PIXEL, entitlement: "owned" });
    for (const entitlement of ["unknown", "pending"] as const) {
      expect((await ads.report({ ...PIXEL, entitlement })).adsFree).toBe(true);
    }
    expect(await stored()).toEqual({ grants: [{ ...PIXEL, grantedAt: 100 }] });
  });

  it("grants nothing for a phone that does not own it", async () => {
    const ads = grants();
    for (const entitlement of ["unknown", "pending", "not-owned"] as const) {
      expect(await ads.report({ ...PIXEL, entitlement })).toEqual({ adsFree: false });
    }
  });

  it("tells subscribers only when the ads state changes", async () => {
    const ads = grants();
    const seen: unknown[] = [];
    const stop = ads.subscribe((state) => seen.push(state));
    await ads.report({ ...PIXEL, entitlement: "not-owned" });
    await ads.report({ ...PIXEL, entitlement: "owned" });
    await ads.report({ ...PIXEL, entitlement: "owned" });
    await ads.report({ ...PIXEL, entitlement: "pending" });
    await ads.report({ ...PIXEL, entitlement: "not-owned" });
    stop();
    await ads.report({ ...PIXEL, entitlement: "owned" });
    expect(seen).toEqual([{ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 100 } }, { adsFree: false }]);
  });

  it("tolerates a file that is not JSON or not a list of grants", async () => {
    await writeFile(file, "{ not json");
    expect(await grants().status()).toEqual({ adsFree: false });

    await writeFile(file, JSON.stringify({ grants: "many" }));
    expect(await grants().status()).toEqual({ adsFree: false });

    await writeFile(file, JSON.stringify({ grants: [{ deviceId: 5 }, null, { deviceId: "device-pixel-0001", deviceName: "Pixel 8", grantedAt: 7 }, { deviceId: "x", deviceName: "", grantedAt: "soon" }] }));
    expect(await grants().status()).toEqual({ adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 7 } });
  });

  it("stops recording new devices at the limit, when the computer is ad-free anyway", async () => {
    const ads = grants();
    for (let index = 0; index < MAX_ADS_GRANTS + 5; index += 1) {
      await ads.report({ deviceId: `device-number-${index}`, deviceName: `Phone ${index}`, entitlement: "owned" });
    }
    expect(((await stored()) as { grants: unknown[] }).grants).toHaveLength(MAX_ADS_GRANTS);
    expect((await ads.status()).adsFree).toBe(true);
  });
});
