import type { Phrase } from "../domain/phrase";

export interface PhraseRepository {
  list(): Promise<Phrase[]>;
  save(phrase: Phrase): Promise<void>;
  delete(id: string): Promise<void>;
}
