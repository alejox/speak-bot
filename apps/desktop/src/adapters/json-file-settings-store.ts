import { DEFAULT_VOICE_OUTPUT, isUiLanguage, isVoiceOutput, type DesktopSettings, type ObsConnectionConfig } from "@speed-deck/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic } from "./json-file";

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

export const MAX_PORT = 65_535;
const MAX_HOST_LENGTH = 253;
const MAX_PASSWORD_LENGTH = 500;

/** How the desktop reaches OBS. Only stored in the settings file: the API shows `hasPassword` instead. */
export interface ObsConfig extends ObsConnectionConfig {
  enabled: boolean;
}

export const DEFAULT_OBS_CONFIG: ObsConfig = { enabled: false, host: "127.0.0.1", port: 4455, password: "" };

/** The settings as stored, including secrets. Use `toPublicSettings` before sending them anywhere. */
export type StoredSettings = Omit<DesktopSettings, "obs"> & { obs: ObsConfig };

/** Default settings; `obs` defaults to `DEFAULT_OBS_CONFIG`. */
export type SettingsDefaults = Omit<DesktopSettings, "obs"> & { obs?: ObsConfig };

/** The settings as the API and the tray show them: the OBS password is replaced by `hasPassword`. */
export function toPublicSettings({ obs, ...rest }: StoredSettings): DesktopSettings {
  return { ...rest, obs: { enabled: obs.enabled, host: obs.host, port: obs.port, hasPassword: obs.password !== "" } };
}

/** Persists the desktop voice, rate, output device, languages, caption visibility and OBS connection in a JSON file. */
export class JsonFileSettingsStore {
  private readonly queue = new SerialQueue();
  private readonly defaults: StoredSettings;

  constructor(
    private readonly file: string,
    defaults: SettingsDefaults,
  ) {
    this.defaults = { ...defaults, voiceOutput: defaults.voiceOutput ?? DEFAULT_VOICE_OUTPUT, obs: { ...(defaults.obs ?? DEFAULT_OBS_CONFIG) } };
  }

  /** The settings without secrets. */
  async load(): Promise<DesktopSettings> {
    return toPublicSettings(await this.loadStored());
  }

  /** The settings including the OBS password; never send these to a client. */
  loadStored(): Promise<StoredSettings> {
    return this.queue.run(() => this.read());
  }

  /** Merges a partial update, validating every provided field. Resolves with the settings without secrets. */
  async update(patch: unknown): Promise<DesktopSettings> {
    return toPublicSettings(await this.updateStored(patch));
  }

  /** Like `update`, resolving with the stored settings including secrets. */
  updateStored(patch: unknown): Promise<StoredSettings> {
    const { obs, ...changes } = parseSettingsPatch(patch);
    return this.queue.run(async () => {
      const current = await this.read();
      const next: StoredSettings = { ...current, ...changes, obs: mergeObsConfig(current.obs, obs) };
      await writeJsonFileAtomic(this.file, next);
      return next;
    });
  }

  private async read(): Promise<StoredSettings> {
    const content = await readJsonFile(this.file);
    if (content.status !== "ok" || typeof content.value !== "object" || content.value === null) {
      return { ...this.defaults, obs: { ...this.defaults.obs } };
    }
    const stored = content.value as Record<string, unknown>;
    const settings: StoredSettings = {
      voiceId: typeof stored.voiceId === "string" ? stored.voiceId : this.defaults.voiceId,
      rate: isValidRate(stored.rate) ? stored.rate : this.defaults.rate,
      deviceId: typeof stored.deviceId === "string" ? stored.deviceId : this.defaults.deviceId,
      language: isUiLanguage(stored.language) ? stored.language : this.defaults.language,
      captionsVisible: typeof stored.captionsVisible === "boolean" ? stored.captionsVisible : this.defaults.captionsVisible,
      voiceOutput: isVoiceOutput(stored.voiceOutput) ? stored.voiceOutput : this.defaults.voiceOutput,
      obs: readObsConfig(stored.obs, this.defaults.obs),
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

function readObsConfig(value: unknown, defaults: ObsConfig): ObsConfig {
  if (typeof value !== "object" || value === null) return { ...defaults };
  const stored = value as Record<string, unknown>;
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : defaults.enabled,
    host: isValidHost(stored.host) ? stored.host : defaults.host,
    port: isValidPort(stored.port) ? stored.port : defaults.port,
    password: typeof stored.password === "string" && stored.password.length <= MAX_PASSWORD_LENGTH ? stored.password : defaults.password,
  };
}

export function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PORT;
}

/** A host name or IP address: no spaces, slashes or other URL parts. */
export function isValidHost(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_HOST_LENGTH && /^[A-Za-z0-9.:_-]+$/.test(value);
}

/**
 * Applies an OBS patch. Pointing the desktop at another host or port forgets the saved password
 * (unless the same patch brings a new one), so it is never sent to a server it was not meant for.
 */
function mergeObsConfig(current: ObsConfig, patch: Partial<ObsConfig> | undefined): ObsConfig {
  if (!patch) return current;
  const next = { ...current, ...patch };
  const moved = next.host !== current.host || next.port !== current.port;
  if (moved && patch.password === undefined) next.password = "";
  return next;
}

function parseObsPatch(patch: unknown): Partial<ObsConfig> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new InvalidSettingsError("obs must be an object.");
  const { enabled, host, port, password } = patch as Record<string, unknown>;
  const changes: Partial<ObsConfig> = {};
  if (enabled !== undefined) {
    if (typeof enabled !== "boolean") throw new InvalidSettingsError("obs.enabled must be true or false.");
    changes.enabled = enabled;
  }
  if (host !== undefined) {
    if (!isValidHost(host)) throw new InvalidSettingsError("obs.host must be a host name or IP address.");
    changes.host = host;
  }
  if (port !== undefined) {
    if (!isValidPort(port)) throw new InvalidSettingsError(`obs.port must be an integer from 1 to ${MAX_PORT}.`);
    changes.port = port;
  }
  if (password !== undefined) {
    if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) throw new InvalidSettingsError("obs.password must be a string.");
    changes.password = password;
  }
  return changes;
}

function parseSettingsPatch(patch: unknown): Partial<Omit<DesktopSettings, "obs">> & { obs?: Partial<ObsConfig> } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new InvalidSettingsError("Settings must be a JSON object.");
  }
  const { voiceId, rate, deviceId, language, captionsVisible, voiceLanguage, voiceOutput, obs } = patch as Record<string, unknown>;
  const changes: Partial<Omit<DesktopSettings, "obs">> & { obs?: Partial<ObsConfig> } = {};
  if (obs !== undefined) changes.obs = parseObsPatch(obs);
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
  if (voiceOutput !== undefined) {
    if (!isVoiceOutput(voiceOutput)) throw new InvalidSettingsError('voiceOutput must be "speakers", "obs" or "both".');
    changes.voiceOutput = voiceOutput;
  }
  return changes;
}
