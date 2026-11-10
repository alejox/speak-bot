import { assignMissingSlots, PhraseNotFoundError, type Phrase, type PhraseRepository, type StoredPhrase } from "@speak-bot/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic } from "./json-file";

/** Stores phrases in a JSON file in the data directory. */
export class JsonFilePhraseRepository implements PhraseRepository {
  private readonly queue = new SerialQueue();

  constructor(private readonly file: string) {}

  /** False until the file has been written once; used to seed default phrases on first run. */
  exists(): Promise<boolean> {
    return this.queue.run(async () => (await readJsonFile(this.file)).status !== "missing");
  }

  list(): Promise<Phrase[]> {
    return this.queue.run(() => this.read());
  }

  save(phrase: Phrase): Promise<void> {
    return this.queue.run(async () => {
      const phrases = await this.read();
      await writeJsonFileAtomic(this.file, [...phrases.filter((existing) => existing.id !== phrase.id), phrase]);
    });
  }

  update(phrase: Phrase): Promise<void> {
    return this.queue.run(async () => {
      const phrases = await this.read();
      if (!phrases.some((existing) => existing.id === phrase.id)) throw new PhraseNotFoundError(phrase.id);
      await writeJsonFileAtomic(this.file, phrases.map((existing) => (existing.id === phrase.id ? phrase : existing)));
    });
  }

  delete(id: string): Promise<void> {
    return this.queue.run(async () => {
      const phrases = await this.read();
      await writeJsonFileAtomic(this.file, phrases.filter((phrase) => phrase.id !== id));
    });
  }

  /** One atomic file write inside the queue, so it never interleaves with other writes. */
  replaceAll(phrases: Phrase[]): Promise<void> {
    return this.queue.run(() => writeJsonFileAtomic(this.file, [...phrases]));
  }

  private async read(): Promise<Phrase[]> {
    const content = await readJsonFile(this.file);
    if (content.status !== "ok" || !Array.isArray(content.value)) return [];
    // Older files have no slots; they are assigned here and written back on the next write.
    return assignMissingSlots(content.value.filter(isStoredPhrase));
  }
}

function isStoredPhrase(value: unknown): value is StoredPhrase {
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
