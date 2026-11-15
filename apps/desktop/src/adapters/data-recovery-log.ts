import type { DataRecoveryNotice } from "@speed-deck/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic, type JsonFileOptions, type JsonFileRecovery } from "./json-file";

export interface DataRecoveryLogOptions {
  /** `data-recovery.json` in the data directory. */
  file: string;
  log?: (message: string) => void;
}

type StoredNotice = DataRecoveryNotice & { dismissed: boolean };

/**
 * Remembers that the boards file was found damaged, what was done about it and where the damaged file is,
 * until the person at the computer dismisses the notice. Saved to disk, so a recovery that happened while
 * the app started hidden is still told the next time its window opens, and a dismissal is not forgotten.
 */
export class DataRecoveryLog {
  private readonly queue = new SerialQueue();
  private readonly listeners = new Set<() => void>();
  private notice: StoredNotice | null = null;

  constructor(private readonly options: DataRecoveryLogOptions) {}

  private get fileOptions(): JsonFileOptions {
    return { log: this.options.log };
  }

  /** Reads what an earlier run recorded. Call once, before the boards are first read. */
  async load(): Promise<void> {
    const content = await this.queue.run(() => readJsonFile(this.options.file, this.fileOptions));
    if (content.status !== "ok" || this.notice) return;
    const stored = (content.value as { boards?: unknown } | null)?.boards;
    if (isStoredNotice(stored)) this.notice = stored;
  }

  /** The boards file was just recovered; the latest recovery replaces an earlier one, dismissed or not. */
  record(recovery: JsonFileRecovery): void {
    this.notice = {
      file: "boards",
      outcome: recovery.outcome === "restored" ? "restored" : "defaults",
      at: recovery.at,
      damagedCopyPath: recovery.damagedCopy,
      dismissed: false,
    };
    this.save();
    for (const listener of [...this.listeners]) listener();
  }

  /** The recovery to tell the person about, or null when there is none or it was dismissed. */
  current(): DataRecoveryNotice | null {
    if (!this.notice || this.notice.dismissed) return null;
    const { dismissed: _dismissed, ...notice } = this.notice;
    return notice;
  }

  /** The person read the notice; it is not shown again. The damaged file stays where it is. */
  async dismiss(): Promise<void> {
    if (!this.notice || this.notice.dismissed) return;
    this.notice = { ...this.notice, dismissed: true };
    await this.save();
    for (const listener of [...this.listeners]) listener();
  }

  /** Notifies when a recovery is recorded or dismissed. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves once everything recorded so far is on disk. */
  idle(): Promise<void> {
    return this.queue.run(async () => {});
  }

  /** Never rejects: a notice that could not be saved is still shown in this run. */
  private save(): Promise<void> {
    const snapshot = this.notice;
    return this.queue
      .run(() => writeJsonFileAtomic(this.options.file, { boards: snapshot }, this.fileOptions))
      .catch((error: unknown) => this.options.log?.(`Could not save the data recovery notice: ${error instanceof Error ? error.message : String(error)}`));
  }
}

function isStoredNotice(value: unknown): value is StoredNotice {
  if (typeof value !== "object" || value === null) return false;
  const { file, outcome, at, damagedCopyPath, dismissed } = value as Record<string, unknown>;
  return (
    file === "boards" &&
    (outcome === "restored" || outcome === "defaults") &&
    typeof at === "number" &&
    Number.isFinite(at) &&
    typeof damagedCopyPath === "string" &&
    typeof dismissed === "boolean"
  );
}
