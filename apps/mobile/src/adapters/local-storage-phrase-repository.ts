import { assignMissingSlots, PhraseNotFoundError, type Phrase, type PhraseRepository, type StoredPhrase } from "@speak-bot/core";
import { getLocalStorage, readJson, writeJson } from "./browser-storage";

export const PHRASES_STORAGE_KEY = "speak-bot:phrases";

/**
 * Persists phrases in localStorage. When storage is unavailable or a write fails,
 * it keeps working in memory for the rest of the session instead of crashing.
 */
export class LocalStoragePhraseRepository implements PhraseRepository {
  private memory: Phrase[] = [];
  private useMemory: boolean;

  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = PHRASES_STORAGE_KEY,
  ) {
    this.useMemory = storage === null;
  }

  /** True once phrases were stored at least once, even if the list is now empty. */
  isInitialized(): boolean {
    if (this.useMemory) return this.memory.length > 0;
    try {
      return this.storage?.getItem(this.key) != null;
    } catch {
      return false;
    }
  }

  async list(): Promise<Phrase[]> {
    return [...this.read()];
  }

  async save(phrase: Phrase): Promise<void> {
    this.write([...this.read().filter((existing) => existing.id !== phrase.id), phrase]);
  }

  async update(phrase: Phrase): Promise<void> {
    const phrases = this.read();
    if (!phrases.some((existing) => existing.id === phrase.id)) throw new PhraseNotFoundError(phrase.id);
    this.write(phrases.map((existing) => (existing.id === phrase.id ? phrase : existing)));
  }

  async delete(id: string): Promise<void> {
    this.write(this.read().filter((phrase) => phrase.id !== id));
  }

  async replaceAll(phrases: Phrase[]): Promise<void> {
    this.write([...phrases]);
  }

  private read(): Phrase[] {
    if (this.useMemory) return this.memory;
    const stored = readJson(this.storage, this.key);
    // Older data has no slots; they are assigned here and stored on the next write.
    return Array.isArray(stored) ? assignMissingSlots(stored.filter(isStoredPhrase)) : [];
  }

  private write(phrases: Phrase[]): void {
    this.memory = phrases;
    if (!this.useMemory && !writeJson(this.storage, this.key, phrases)) this.useMemory = true;
  }
}

/** A phrase as stored or sent by the desktop; the slot may be missing in older data. */
export function isStoredPhrase(value: unknown): value is StoredPhrase {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    candidate.text.trim() !== "" &&
    typeof candidate.createdAt === "number" &&
    (candidate.label === undefined || typeof candidate.label === "string") &&
    (candidate.slot === undefined || typeof candidate.slot === "number")
  );
}
