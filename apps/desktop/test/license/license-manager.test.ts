import {
  InvalidLicenseKeyError,
  LicenseServiceUnavailableError,
  LicensingDisabledError,
  type LicenseResponse,
  type LicenseService,
} from "@speed-deck/core";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileLicenseStore } from "../../src/license/json-file-license-store";
import { LICENSE_VALIDATION_INTERVAL_MS, LicenseManager } from "../../src/license/license-manager";

const KEY = "38B1460A-5104-4067-A91D-77B872934D51";

class FakeLicenseService implements LicenseService {
  readonly calls: string[] = [];
  activateResult: Error | undefined;
  validateResult: "valid" | "invalid" | Error = "valid";
  deactivateResult: Error | undefined;
  async activate(key: string, instanceName: string) {
    this.calls.push(`activate:${key}:${instanceName}`);
    if (this.activateResult) throw this.activateResult;
    return { instanceId: "inst-1" };
  }
  async validate(key: string, instanceId: string) {
    this.calls.push(`validate:${key}:${instanceId}`);
    if (this.validateResult instanceof Error) throw this.validateResult;
    return this.validateResult;
  }
  async deactivate(key: string, instanceId: string) {
    this.calls.push(`deactivate:${key}:${instanceId}`);
    if (this.deactivateResult) throw this.deactivateResult;
  }
}

describe("LicenseManager", () => {
  let dir: string;
  let file: string;
  let service: FakeLicenseService;
  let clock: number;
  let timers: Array<{ ms: number; run: () => void; stopped: boolean }>;
  let changes: LicenseResponse[];

  const manager = (options: { service?: LicenseService | null; checkoutUrl?: string } = {}) => {
    const created = new LicenseManager({
      store: new JsonFileLicenseStore(file),
      service: options.service === null ? undefined : (options.service ?? service),
      instanceName: "Studio Mac",
      checkoutUrl: options.checkoutUrl,
      now: () => clock,
      every: (ms, run) => {
        const timer = { ms, run, stopped: false };
        timers.push(timer);
        return () => {
          timer.stopped = true;
        };
      },
    });
    created.subscribe((license) => changes.push(license));
    return created;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-license-"));
    file = join(dir, "license.json");
    service = new FakeLicenseService();
    clock = 1_000;
    timers = [];
    changes = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("shows ads until a key is activated", async () => {
    const license = manager({ checkoutUrl: "https://store.example/buy" });
    expect(await license.status()).toEqual({ adsFree: false, canActivate: true, checkoutUrl: "https://store.example/buy" });
  });

  it("activates a key, stores it and reports only the masked key", async () => {
    const license = manager();
    const status = await license.activate(`  ${KEY}  `);
    expect(status).toEqual({ adsFree: true, canActivate: true, maskedKey: "••••4D51", lastValidatedAt: 1_000 });
    expect(service.calls).toEqual([`activate:${KEY}:Studio Mac`]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ key: KEY, instanceId: "inst-1", status: "active", lastValidatedAt: 1_000 });
    expect(changes).toEqual([status]);
    expect(JSON.stringify(changes)).not.toContain(KEY);
    // A new manager reads the same file.
    expect(await manager().status()).toEqual(status);
  });

  it("keeps showing ads when activation is refused", async () => {
    service.activateResult = new InvalidLicenseKeyError();
    const license = manager();
    await expect(license.activate(KEY)).rejects.toBeInstanceOf(InvalidLicenseKeyError);
    expect((await license.status()).adsFree).toBe(false);
    await expect(stat(file)).rejects.toThrow();
    expect(changes).toEqual([]);
  });

  it("refuses to activate when licensing is not configured", async () => {
    const license = manager({ service: null });
    expect(await license.status()).toEqual({ adsFree: false, canActivate: false });
    await expect(license.activate(KEY)).rejects.toBeInstanceOf(LicensingDisabledError);
  });

  it("validates at start and every 24 hours", async () => {
    const license = manager();
    await license.activate(KEY);
    service.calls.length = 0;
    clock = 5_000;
    await license.start();
    expect(service.calls).toEqual([`validate:${KEY}:inst-1`]);
    expect(timers.map((timer) => timer.ms)).toEqual([LICENSE_VALIDATION_INTERVAL_MS]);
    expect(LICENSE_VALIDATION_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    expect((await license.status()).lastValidatedAt).toBe(5_000);

    clock = 9_000;
    timers[0]!.run();
    await license.idle();
    expect(service.calls).toHaveLength(2);
    expect((await license.status()).lastValidatedAt).toBe(9_000);

    license.stop();
    expect(timers[0]!.stopped).toBe(true);
  });

  it("keeps the stored status while the license server cannot be reached", async () => {
    const license = manager();
    await license.activate(KEY);
    changes.length = 0;
    service.validateResult = new LicenseServiceUnavailableError();
    clock = 50_000;
    await license.validate();
    expect(await license.status()).toMatchObject({ adsFree: true, lastValidatedAt: 1_000 });
    expect(changes).toEqual([]);
  });

  it("turns ads back on when the server says the key is no longer valid, and off again if it recovers", async () => {
    const license = manager();
    await license.activate(KEY);
    changes.length = 0;
    service.validateResult = "invalid";
    clock = 2_000;
    await license.validate();
    expect(await license.status()).toEqual({ adsFree: false, canActivate: true, maskedKey: "••••4D51", lastValidatedAt: 2_000 });
    expect(changes.map((change) => change.adsFree)).toEqual([false]);

    service.validateResult = "valid";
    await license.validate();
    expect((await license.status()).adsFree).toBe(true);
    expect(changes.map((change) => change.adsFree)).toEqual([false, true]);
  });

  it("does nothing at start without a stored key", async () => {
    const license = manager();
    await license.start();
    expect(service.calls).toEqual([]);
  });

  it("removes the license: deactivates the instance and deletes the file", async () => {
    const license = manager();
    await license.activate(KEY);
    changes.length = 0;
    const status = await license.remove();
    expect(status).toEqual({ adsFree: false, canActivate: true });
    expect(service.calls).toContain(`deactivate:${KEY}:inst-1`);
    await expect(stat(file)).rejects.toThrow();
    expect(changes).toEqual([status]);
  });

  it("keeps the license when the server cannot be reached to free the activation", async () => {
    const license = manager();
    await license.activate(KEY);
    service.deactivateResult = new LicenseServiceUnavailableError();
    await expect(license.remove()).rejects.toBeInstanceOf(LicenseServiceUnavailableError);
    expect((await license.status()).adsFree).toBe(true);
  });

  it("ignores a corrupt or incomplete license file", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, JSON.stringify({ key: KEY, status: "active" }));
    expect((await manager().status()).adsFree).toBe(false);
  });
});
