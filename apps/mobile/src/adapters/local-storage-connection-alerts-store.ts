import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** How this device tells the person that it lost the computer. */
export interface ConnectionAlerts {
  vibrate: boolean;
}

export const DEFAULT_CONNECTION_ALERTS: ConnectionAlerts = { vibrate: true };

export interface ConnectionAlertsStore {
  /** The defaults when the user never chose on this device. */
  load(): ConnectionAlerts;
  save(alerts: ConnectionAlerts): void;
}

export const CONNECTION_ALERTS_STORAGE_KEY = "speed-deck:connection-alerts";

export class LocalStorageConnectionAlertsStore implements ConnectionAlertsStore {
  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = CONNECTION_ALERTS_STORAGE_KEY,
  ) {}

  load(): ConnectionAlerts {
    const stored = readJson(this.storage, this.key);
    const vibrate = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>).vibrate : undefined;
    return { vibrate: typeof vibrate === "boolean" ? vibrate : DEFAULT_CONNECTION_ALERTS.vibrate };
  }

  save(alerts: ConnectionAlerts): void {
    writeJson(this.storage, this.key, alerts);
  }
}
