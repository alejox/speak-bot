import { rm } from "node:fs/promises";
import { readJsonFile, writeJsonFileAtomic } from "../adapters/json-file";

/** What `license.json` holds. The key stays on this computer and is only sent to the license server. */
export interface StoredLicense {
  key: string;
  instanceId: string;
  /** "invalid" after the license server said the key is expired, disabled or unknown: ads are on. */
  status: "active" | "invalid";
  /** Epoch ms of the last answer from the license server. */
  lastValidatedAt: number;
}

export class JsonFileLicenseStore {
  constructor(private readonly file: string) {}

  /** The stored license, or null when there is none or the file is not a complete license. */
  async load(): Promise<StoredLicense | null> {
    const content = await readJsonFile(this.file);
    if (content.status !== "ok" || typeof content.value !== "object" || content.value === null) return null;
    const { key, instanceId, status, lastValidatedAt } = content.value as Record<string, unknown>;
    if (typeof key !== "string" || key === "" || typeof instanceId !== "string" || instanceId === "") return null;
    if (status !== "active" && status !== "invalid") return null;
    if (typeof lastValidatedAt !== "number" || !Number.isFinite(lastValidatedAt)) return null;
    return { key, instanceId, status, lastValidatedAt };
  }

  save(license: StoredLicense): Promise<void> {
    return writeJsonFileAtomic(this.file, license);
  }

  clear(): Promise<void> {
    return rm(this.file, { force: true });
  }
}
