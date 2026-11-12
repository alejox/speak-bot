import { MAX_ADS_DEVICE_ID_LENGTH, MAX_ADS_DEVICE_NAME_LENGTH, type AdsPurchaseReport, type AdsResponse } from "@speed-deck/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic } from "../adapters/json-file";

/** A phone that reported owning "remove ads". */
export interface AdsGrant {
  deviceId: string;
  deviceName: string;
  /** Epoch ms of the phone's first report. */
  grantedAt: number;
}

/** More phones than anyone pairs with one computer; past it new devices are not recorded (ads are off anyway). */
export const MAX_ADS_GRANTS = 50;

export interface AdsGrantsOptions {
  /** `ads-grants.json` in the data directory. */
  file: string;
  now: () => number;
}

export type AdsListener = (ads: AdsResponse) => void;

/**
 * The phones whose "remove ads" purchase removes the ads of this computer. The computer is ad-free while
 * at least one grant is saved, also when that phone is off or away. The phone's word is trusted: the
 * purchase is not checked with its app store.
 */
export class AdsGrants {
  private readonly queue = new SerialQueue();
  private readonly listeners = new Set<AdsListener>();

  constructor(private readonly options: AdsGrantsOptions) {}

  subscribe(listener: AdsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): Promise<AdsResponse> {
    return this.queue.run(async () => toResponse(await this.load()));
  }

  /**
   * What a phone says about its purchase: "owned" saves its grant (once; a new name replaces the old one),
   * "not-owned" removes it (a refund), "unknown" and "pending" change nothing.
   */
  report(report: AdsPurchaseReport): Promise<AdsResponse> {
    return this.queue.run(async () => {
      const grants = await this.load();
      const next = applyReport(grants, report, this.options.now());
      if (next === grants) return toResponse(grants);
      await writeJsonFileAtomic(this.options.file, { grants: next });
      const response = toResponse(next);
      if (JSON.stringify(response) !== JSON.stringify(toResponse(grants))) {
        for (const listener of [...this.listeners]) listener(response);
      }
      return response;
    });
  }

  /** The saved grants, oldest first; a missing, unreadable or malformed file counts as none. */
  private async load(): Promise<AdsGrant[]> {
    const content = await readJsonFile(this.options.file);
    if (content.status !== "ok" || typeof content.value !== "object" || content.value === null) return [];
    const { grants } = content.value as Record<string, unknown>;
    if (!Array.isArray(grants)) return [];
    return grants.filter(isGrant).slice(0, MAX_ADS_GRANTS).map(({ deviceId, deviceName, grantedAt }) => ({ deviceId, deviceName, grantedAt }));
  }
}

/** The grants after `report`; the same array when nothing changes. */
function applyReport(grants: AdsGrant[], report: AdsPurchaseReport, now: number): AdsGrant[] {
  const existing = grants.find((grant) => grant.deviceId === report.deviceId);
  if (report.entitlement === "not-owned") return existing ? grants.filter((grant) => grant !== existing) : grants;
  if (report.entitlement !== "owned") return grants;
  if (existing) {
    if (existing.deviceName === report.deviceName) return grants;
    return grants.map((grant) => (grant === existing ? { ...grant, deviceName: report.deviceName } : grant));
  }
  if (grants.length >= MAX_ADS_GRANTS) return grants;
  return [...grants, { deviceId: report.deviceId, deviceName: report.deviceName, grantedAt: now }];
}

function toResponse(grants: readonly AdsGrant[]): AdsResponse {
  const first = grants[0];
  return first ? { adsFree: true, grantedBy: { deviceName: first.deviceName, grantedAt: first.grantedAt } } : { adsFree: false };
}

function isGrant(value: unknown): value is AdsGrant {
  if (typeof value !== "object" || value === null) return false;
  const { deviceId, deviceName, grantedAt } = value as Record<string, unknown>;
  return (
    typeof deviceId === "string" &&
    deviceId !== "" &&
    deviceId.length <= MAX_ADS_DEVICE_ID_LENGTH &&
    typeof deviceName === "string" &&
    deviceName !== "" &&
    deviceName.length <= MAX_ADS_DEVICE_NAME_LENGTH &&
    typeof grantedAt === "number" &&
    Number.isFinite(grantedAt)
  );
}
