import { isUiLanguage, type DesktopSettings } from "@speak-bot/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic } from "./json-file";

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

/** Persists the desktop voice, rate, output device, languages and caption visibility in a JSON file. */
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
    const settings: DesktopSettings = {
      voiceId: typeof stored.voiceId === "string" ? stored.voiceId : this.defaults.voiceId,
      rate: isValidRate(stored.rate) ? stored.rate : this.defaults.rate,
      deviceId: typeof stored.deviceId === "string" ? stored.deviceId : this.defaults.deviceId,
      language: isUiLanguage(stored.language) ? stored.language : this.defaults.language,
      captionsVisible: typeof stored.captionsVisible === "boolean" ? stored.captionsVisible : this.defaults.captionsVisible,
    };
    // Absent until chosen, so the automatic voice keeps following the interface language.
    const voiceLanguage = isUiLanguage(stored.voiceLanguage) ? stored.voiceLanguage : this.defaults.voiceLanguage;
    if (voiceLanguage) settings.voiceLanguage = voiceLanguage;
    return settings;
  }
}

export function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_RATE && value <= MAX_RATE;
}

function parseSettingsPatch(patch: unknown): Partial<DesktopSettings> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new InvalidSettingsError("Settings must be a JSON object.");
  }
  const { voiceId, rate, deviceId, language, captionsVisible, voiceLanguage } = patch as Record<string, unknown>;
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
  if (language !== undefined) {
    if (!isUiLanguage(language)) throw new InvalidSettingsError('language must be "es" or "en".');
    changes.language = language;
  }
  if (captionsVisible !== undefined) {
    if (typeof captionsVisible !== "boolean") throw new InvalidSettingsError("captionsVisible must be true or false.");
    changes.captionsVisible = captionsVisible;
  }
  if (voiceLanguage !== undefined) {
    if (!isUiLanguage(voiceLanguage)) throw new InvalidSettingsError('voiceLanguage must be "es" or "en".');
    changes.voiceLanguage = voiceLanguage;
  }
  return changes;
}
