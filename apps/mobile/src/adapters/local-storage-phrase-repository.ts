import type { Phrase, PhraseRepository } from "@speak-bot/core";
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

  async delete(id: string): Promise<void> {
    this.write(this.read().filter((phrase) => phrase.id !== id));
  }

  private read(): Phrase[] {
    if (this.useMemory) return this.memory;
    const stored = readJson(this.storage, this.key);
    return Array.isArray(stored) ? stored.filter(isPhrase) : [];
  }

  private write(phrases: Phrase[]): void {
    this.memory = phrases;
    if (!this.useMemory && !writeJson(this.storage, this.key, phrases)) this.useMemory = true;
  }
}

function isPhrase(value: unknown): value is Phrase {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    candidate.text.trim() !== "" &&
    typeof candidate.createdAt === "number" &&
    (candidate.label === undefined || typeof candidate.label === "string")
  );
}
