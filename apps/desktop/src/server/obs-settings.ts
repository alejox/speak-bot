import type { ObsController, ObsStatus } from "@speak-bot/core";
import type { ObsConfig } from "../adapters/json-file-settings-store";

/** OBS control is turned off in the settings. */
export class ObsDisabledError extends Error {
  constructor() {
    super("OBS control is turned off in the settings.");
    this.name = "ObsDisabledError";
  }
}

/** Connects to OBS when enabled (resolving with the first attempt's status), otherwise disconnects. */
export async function applyObsSettings(obs: ObsController, config: ObsConfig): Promise<ObsStatus> {
  if (!config.enabled) {
    await obs.disconnect();
    return obs.status();
  }
  return obs.connect({ host: config.host, port: config.port, password: config.password });
}
