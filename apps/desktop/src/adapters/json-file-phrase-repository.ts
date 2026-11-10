import type { Phrase, PhraseRepository } from "@speak-bot/core";
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

  delete(id: string): Promise<void> {
    return this.queue.run(async () => {
      const phrases = await this.read();
      await writeJsonFileAtomic(this.file, phrases.filter((phrase) => phrase.id !== id));
    });
  }

  private async read(): Promise<Phrase[]> {
    const content = await readJsonFile(this.file);
    if (content.status !== "ok" || !Array.isArray(content.value)) return [];
    return content.value.filter(isPhrase);
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
