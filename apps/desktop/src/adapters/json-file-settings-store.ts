import type { DesktopSettings } from "@speak-bot/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic } from "./json-file";

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

/** Persists the desktop voice, rate and output device in a JSON file. */
export class JsonFileSettingsStore {
  private readonly queue = new SerialQueue();

  constructor(
    private readonly file: string,
    private readonly defaults: DesktopSettings,
  ) {}

  load(): Promise<DesktopSettings> {
    return this.queue.run(() => this.read());
  }

  /** Merges a partial update, validating every provided field. */
  update(patch: unknown): Promise<DesktopSettings> {
    const changes = parseSettingsPatch(patch);
    return this.queue.run(async () => {
      const next = { ...(await this.read()), ...changes };
      await writeJsonFileAtomic(this.file, next);
      return next;
    });
  }

  private async read(): Promise<DesktopSettings> {
    const content = await readJsonFile(this.file);
    if (content.status !== "ok" || typeof content.value !== "object" || content.value === null) return { ...this.defaults };
    const stored = content.value as Record<string, unknown>;
    return {
      voiceId: typeof stored.voiceId === "string" ? stored.voiceId : this.defaults.voiceId,
      rate: isValidRate(stored.rate) ? stored.rate : this.defaults.rate,
      deviceId: typeof stored.deviceId === "string" ? stored.deviceId : this.defaults.deviceId,
    };
  }
}

export function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_RATE && value <= MAX_RATE;
}

function parseSettingsPatch(patch: unknown): Partial<DesktopSettings> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new InvalidSettingsError("Settings must be a JSON object.");
  }
  const { voiceId, rate, deviceId } = patch as Record<string, unknown>;
  const changes: Partial<DesktopSettings> = {};
  if (voiceId !== undefined) {
    if (typeof voiceId !== "string" || voiceId.length > 200) throw new InvalidSettingsError("voiceId must be a string.");
    changes.voiceId = voiceId;
  }
  if (rate !== undefined) {
    if (!isValidRate(rate)) throw new InvalidSettingsError(`rate must be a number between ${MIN_RATE} and ${MAX_RATE}.`);
    changes.rate = rate;
  }
  if (deviceId !== undefined) {
    if (typeof deviceId !== "string" || deviceId.length > 500) throw new InvalidSettingsError("deviceId must be a string.");
    changes.deviceId = deviceId;
  }
  return changes;
}
