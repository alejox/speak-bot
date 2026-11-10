import type { Phrase } from "../domain/phrase";

export interface PhraseRepository {
  /** Every phrase with a unique slot (older data is given slots on read, see `assignMissingSlots`). */
  list(): Promise<Phrase[]>;
  /** Inserts the phrase, or replaces the one with the same id. */
  save(phrase: Phrase): Promise<void>;
  /** Replaces the existing phrase with the same id; rejects with `PhraseNotFoundError` when there is none. */
  update(phrase: Phrase): Promise<void>;
  delete(id: string): Promise<void>;
  /** Replaces every stored phrase with `phrases` in one write: either all of them are stored or nothing changes. */
  replaceAll(phrases: Phrase[]): Promise<void>;
}
