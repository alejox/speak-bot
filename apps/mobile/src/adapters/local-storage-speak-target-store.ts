import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** Where speech plays: on this device (Web Speech) or on the desktop computer. */
export type SpeakTarget = "device" | "computer";

export interface SpeakTargetStore {
  /** Null when the user never chose. */
  load(): SpeakTarget | null;
  save(target: SpeakTarget): void;
}

export const SPEAK_TARGET_STORAGE_KEY = "speed-deck:speak-target";

export class LocalStorageSpeakTargetStore implements SpeakTargetStore {
  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = SPEAK_TARGET_STORAGE_KEY,
  ) {}

  load(): SpeakTarget | null {
    const stored = readJson(this.storage, this.key);
    return stored === "device" || stored === "computer" ? stored : null;
  }

  save(target: SpeakTarget): void {
    writeJson(this.storage, this.key, target);
  }
}
