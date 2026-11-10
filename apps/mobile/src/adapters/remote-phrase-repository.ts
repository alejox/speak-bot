import type { Phrase, PhraseRepository } from "@speak-bot/core";
import type { DesktopApiClient } from "./desktop-api";
import { isPhrase } from "./local-storage-phrase-repository";

/** Phrases stored on the desktop, shared by every device connected to it. */
export class RemotePhraseRepository implements PhraseRepository {
  constructor(private readonly api: DesktopApiClient) {}

  async list(): Promise<Phrase[]> {
    const phrases = await this.api.listPhrases();
    return Array.isArray(phrases) ? phrases.filter(isPhrase) : [];
  }

  save(phrase: Phrase): Promise<void> {
    return this.api.savePhrase(phrase);
  }

  delete(id: string): Promise<void> {
    return this.api.deletePhrase(id);
  }
}
