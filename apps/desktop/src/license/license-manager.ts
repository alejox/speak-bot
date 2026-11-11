import {
  LicenseServiceUnavailableError,
  LicensingDisabledError,
  maskLicenseKey,
  type LicenseResponse,
  type LicenseService,
} from "@speed-deck/core";
import { SerialQueue } from "../adapters/json-file";
import type { JsonFileLicenseStore, StoredLicense } from "./json-file-license-store";

export const LICENSE_VALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface LicenseManagerOptions {
  store: JsonFileLicenseStore;
  /** Absent when this build has no store configured: keys cannot be activated and ads stay on. */
  service?: LicenseService;
  /** Sent to the license server as the instance name (the computer name). */
  instanceName: string;
  /** Where to buy a key. */
  checkoutUrl?: string;
  now: () => number;
  /** Runs `run` every `ms`; returns a function that stops it. Defaults to an unref'd setInterval. */
  every?: (ms: number, run: () => void) => () => void;
  log?: (message: string) => void;
}

export type LicenseListener = (license: LicenseResponse) => void;

/**
 * The "remove ads" license of this computer. Validates at start and every 24 h. When the license server
 * cannot be reached the stored status is kept (offline grace); an explicit "invalid" answer turns ads on.
 */
export class LicenseManager {
  private readonly queue = new SerialQueue();
  private readonly listeners = new Set<LicenseListener>();
  private stopTimer: (() => void) | undefined;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LicenseManagerOptions) {}

  subscribe(listener: LicenseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async status(): Promise<LicenseResponse> {
    return this.toResponse(await this.queue.run(() => this.options.store.load()));
  }

  /** Activates `key` on this computer. Rejects with the license errors of `@speed-deck/core`. */
  activate(key: string): Promise<LicenseResponse> {
    return this.queue.run(async () => {
      const service = this.requireService();
      const trimmed = key.trim();
      const { instanceId } = await service.activate(trimmed, this.options.instanceName);
      const previous = await this.options.store.load();
      const license: StoredLicense = { key: trimmed, instanceId, status: "active", lastValidatedAt: this.options.now() };
      await this.options.store.save(license);
      // A replaced key frees its own activation; failing to is not worth refusing the new one.
      if (previous && previous.instanceId !== instanceId) {
        await service.deactivate(previous.key, previous.instanceId).catch(() => undefined);
      }
      return this.changed(license);
    });
  }

  /**
   * Frees this computer's activation and deletes the stored key. Rejects with
   * `LicenseServiceUnavailableError` (keeping the license) when the server cannot be reached.
   */
  remove(): Promise<LicenseResponse> {
    return this.queue.run(async () => {
      const stored = await this.options.store.load();
      if (stored && this.options.service) await this.options.service.deactivate(stored.key, stored.instanceId);
      await this.options.store.clear();
      return this.changed(null);
    });
  }

  /** Asks the license server whether the stored key is still valid. Never rejects. */
  validate(): Promise<void> {
    const run = this.queue.run(async () => {
      const service = this.options.service;
      const stored = await this.options.store.load();
      if (!service || !stored) return;
      let answer: "valid" | "invalid";
      try {
        answer = await service.validate(stored.key, stored.instanceId);
      } catch (error) {
        if (!(error instanceof LicenseServiceUnavailableError)) throw error;
        this.options.log?.("License: the license server could not be reached; keeping the saved status.");
        return;
      }
      const next: StoredLicense = { ...stored, status: answer === "valid" ? "active" : "invalid", lastValidatedAt: this.options.now() };
      await this.options.store.save(next);
      if (next.status !== stored.status) this.changed(next);
    });
    const settled = run.catch((error: unknown) => this.options.log?.(`License validation failed: ${String(error)}`));
    this.pending = settled;
    return settled;
  }

  /** Validates now and then every 24 h until `stop`. */
  async start(): Promise<void> {
    if (!this.stopTimer) {
      const every = this.options.every ?? unrefInterval;
      this.stopTimer = every(LICENSE_VALIDATION_INTERVAL_MS, () => void this.validate());
    }
    await this.validate();
  }

  stop(): void {
    this.stopTimer?.();
    this.stopTimer = undefined;
  }

  /** Resolves once the latest validation has finished (for tests and shutdown). */
  async idle(): Promise<void> {
    await this.pending;
  }

  private requireService(): LicenseService {
    if (!this.options.service) throw new LicensingDisabledError();
    return this.options.service;
  }

  private changed(license: StoredLicense | null): LicenseResponse {
    const response = this.toResponse(license);
    for (const listener of [...this.listeners]) listener(response);
    return response;
  }

  private toResponse(license: StoredLicense | null): LicenseResponse {
    const response: { -readonly [K in keyof LicenseResponse]: LicenseResponse[K] } = {
      adsFree: license?.status === "active",
      canActivate: this.options.service !== undefined,
    };
    if (license) {
      response.maskedKey = maskLicenseKey(license.key);
      response.lastValidatedAt = license.lastValidatedAt;
    }
    if (this.options.checkoutUrl) response.checkoutUrl = this.options.checkoutUrl;
    return response;
  }
}

function unrefInterval(ms: number, run: () => void): () => void {
  const timer = setInterval(run, ms);
  timer.unref();
  return () => clearInterval(timer);
}
