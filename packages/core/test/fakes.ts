import type { Phrase } from "../src/domain/phrase";
import type { PhraseRepository } from "../src/ports/phrase-repository";
import type { SpeakOptions, SpeechSynthesizer, Voice } from "../src/ports/speech-synthesizer";

export class InMemoryPhraseRepository implements PhraseRepository {
  private phrases = new Map<string, Phrase>();
  /** Names of the write operations performed, in order. */
  readonly writes: string[] = [];
  /** When set, `replaceAll` rejects with this error and changes nothing. */
  failReplaceAll: Error | undefined;

  constructor(initial: Phrase[] = []) {
    for (const phrase of initial) this.phrases.set(phrase.id, phrase);
  }

  async list(): Promise<Phrase[]> {
    return [...this.phrases.values()];
  }

  async save(phrase: Phrase): Promise<void> {
    this.writes.push("save");
    this.phrases.set(phrase.id, phrase);
  }

  async delete(id: string): Promise<void> {
    this.writes.push("delete");
    this.phrases.delete(id);
  }

  async replaceAll(phrases: Phrase[]): Promise<void> {
    this.writes.push("replaceAll");
    if (this.failReplaceAll) throw this.failReplaceAll;
    this.phrases = new Map(phrases.map((phrase) => [phrase.id, phrase]));
  }
}

export class FakeSpeechSynthesizer implements SpeechSynthesizer {
  readonly spoken: Array<{ text: string; options: SpeakOptions | undefined }> = [];
  cancelCount = 0;

  constructor(private readonly voices: Voice[] = []) {}

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    this.spoken.push({ text, options });
  }

  cancel(): void {
    this.cancelCount += 1;
  }

  async listVoices(): Promise<Voice[]> {
    return this.voices;
  }
}

export function sequentialIds(prefix = "id"): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
