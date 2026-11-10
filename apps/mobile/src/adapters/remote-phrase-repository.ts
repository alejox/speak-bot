import { assignMissingSlots, type Phrase, type PhraseRepository } from "@speak-bot/core";
import type { DesktopApiClient } from "./desktop-api";
import { isStoredPhrase } from "./local-storage-phrase-repository";

/** Phrases stored on the desktop, shared by every device connected to it. */
export class RemotePhraseRepository implements PhraseRepository {
  constructor(private readonly api: DesktopApiClient) {}

  async list(): Promise<Phrase[]> {
    const phrases = await this.api.listPhrases();
    // An older desktop may not send slots yet.
    return Array.isArray(phrases) ? assignMissingSlots(phrases.filter(isStoredPhrase)) : [];
  }

  save(phrase: Phrase): Promise<void> {
    return this.api.savePhrase(phrase);
  }

  update(phrase: Phrase): Promise<void> {
    return this.api.updatePhrase(phrase);
  }

  delete(id: string): Promise<void> {
    return this.api.deletePhrase(id);
  }

  /**
   * Not supported remotely: the desktop owns its phrase list and restores it atomically through
   * `DesktopApiClient.restorePhrases` (POST /api/phrases/restore).
   */
  async replaceAll(_phrases: Phrase[]): Promise<void> {
    throw new Error("RemotePhraseRepository cannot replace all phrases; use DesktopApiClient.restorePhrases instead.");
  }
}
