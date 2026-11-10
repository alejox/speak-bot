import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** The texts last spoken from the composer on this device, most recent first. */
export interface RecentPhrasesStore {
  load(): string[];
  /** Puts `text` first (once) and returns the new list; empty text changes nothing. */
  add(text: string): string[];
  clear(): void;
}

export const RECENT_PHRASES_STORAGE_KEY = "speed-deck:recent-phrases";
export const MAX_RECENT_PHRASES = 8;

/** Distinct, non-empty, trimmed texts, at most `MAX_RECENT_PHRASES`; anything else stored is dropped. */
function clean(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const phrases: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : "";
    if (text !== "" && !phrases.includes(text)) phrases.push(text);
    if (phrases.length === MAX_RECENT_PHRASES) break;
  }
  return phrases;
}

export class LocalStorageRecentPhrasesStore implements RecentPhrasesStore {
  /** The list as last saved; read instead of storage when the last write did not reach it. */
  private saved: string[] = [];
  private isStored = true;

  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = RECENT_PHRASES_STORAGE_KEY,
  ) {}

  load(): string[] {
    return this.isStored && this.storage ? clean(readJson(this.storage, this.key)) : [...this.saved];
  }

  add(text: string): string[] {
    return this.save(clean([text, ...this.load()]));
  }

  clear(): void {
    this.save([]);
  }

  private save(phrases: string[]): string[] {
    this.saved = phrases;
    this.isStored = writeJson(this.storage, this.key, phrases);
    return [...phrases];
  }
}
