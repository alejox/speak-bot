import {
  assignMissingSlots,
  initializeBoards,
  readStoredBoards,
  type Board,
  type BoardChange,
  type BoardRepository,
  type UiLanguage,
} from "@speed-deck/core";
import { getLocalStorage, readJson, writeJson } from "./browser-storage";
import { isStoredPhrase, PHRASES_STORAGE_KEY } from "./local-storage-phrase-repository";

export const BOARDS_STORAGE_KEY = "speed-deck:boards";
const BOARDS_STORAGE_VERSION = 1;

/**
 * Persists boards for phone-only mode in localStorage. Every `update` reads, changes and writes
 * synchronously, so it is atomic. When storage is unavailable or a write fails, it keeps working in
 * memory for the rest of the session instead of crashing.
 */
export class LocalStorageBoardRepository implements BoardRepository {
  private memory: Board[] = [];
  private useMemory: boolean;

  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = BOARDS_STORAGE_KEY,
  ) {
    this.useMemory = storage === null;
  }

  async list(): Promise<Board[]> {
    return [...this.read()];
  }

  async update<T>(change: (boards: readonly Board[]) => BoardChange<T>): Promise<T> {
    const { boards, result } = change(this.read());
    if (boards) this.write(readStoredBoards(boards));
    return result;
  }

  /** Phrases saved on this device by older versions, or null when there are none. The old key is kept as a backup. */
  legacyPhrases() {
    const stored = readJson(this.storage, PHRASES_STORAGE_KEY);
    return Array.isArray(stored) ? assignMissingSlots(stored.filter(isStoredPhrase)) : null;
  }

  private read(): Board[] {
    if (this.useMemory) return this.memory;
    const stored = readJson(this.storage, this.key);
    return typeof stored === "object" && stored !== null ? readStoredBoards((stored as { boards?: unknown }).boards) : [];
  }

  private write(boards: Board[]): void {
    this.memory = boards;
    if (!this.useMemory && !writeJson(this.storage, this.key, { version: BOARDS_STORAGE_VERSION, boards })) this.useMemory = true;
  }
}

/**
 * Makes sure this device has boards: the phrases saved by older versions become the communication
 * board, otherwise the default one in `language` is created, and the default deck board follows it.
 * Resolves true when it created them. Boards stored before boards had a kind need no step here:
 * `readStoredBoards` gives them one on every read, and the next change stores the result.
 */
export function prepareLocalBoards(repository: LocalStorageBoardRepository, language: UiLanguage): Promise<boolean> {
  return initializeBoards({ repository }, { language, legacyPhrases: repository.legacyPhrases() });
}
