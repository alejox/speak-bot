import type { Phrase } from "../domain/phrase";

export interface PhraseRepository {
  list(): Promise<Phrase[]>;
  save(phrase: Phrase): Promise<void>;
  delete(id: string): Promise<void>;
  /** Replaces every stored phrase with `phrases` in one write: either all of them are stored or nothing changes. */
  replaceAll(phrases: Phrase[]): Promise<void>;
}
