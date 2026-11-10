/** Returns window.localStorage, or null when it is missing or access throws (e.g. blocked by privacy settings). */
export function getLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readJson(storage: Storage | null, key: string): unknown {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Returns false when the value could not be written (storage unavailable, full or disabled). */
export function writeJson(storage: Storage | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Key prefix of every value this app stores, and the prefix used before the rename to Speed Deck. */
export const STORAGE_KEY_PREFIX = "speed-deck:";
const LEGACY_STORAGE_KEY_PREFIX = "speak-bot:";

/**
 * Moves values saved under the old `speak-bot:` keys to the `speed-deck:` keys, once. A value
 * already saved under the new key wins. Never throws: storage that cannot be read is left alone.
 */
export function migrateLegacyStorageKeys(storage: Storage | null): void {
  if (!storage) return;
  try {
    const legacyKeys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_STORAGE_KEY_PREFIX)) legacyKeys.push(key);
    }
    for (const legacyKey of legacyKeys) {
      const key = STORAGE_KEY_PREFIX + legacyKey.slice(LEGACY_STORAGE_KEY_PREFIX.length);
      const value = storage.getItem(legacyKey);
      if (value !== null && storage.getItem(key) === null) storage.setItem(key, value);
      storage.removeItem(legacyKey);
    }
  } catch {
    // Storage is full or blocked: keep the old values for the next start.
  }
}
