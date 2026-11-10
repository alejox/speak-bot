import { createPhrase, type Phrase } from "../domain/phrase";
import type { PhraseRepository } from "../ports/phrase-repository";

export interface PhraseDependencies {
  repository: PhraseRepository;
  generateId: () => string;
  now: () => number;
}

export const DEFAULT_PHRASE_TEXTS = [
  "Hello",
  "Thank you",
  "Yes",
  "No",
  "Please",
  "One moment please",
  "I can't speak but I can hear you",
  "Can you help me?",
] as const;

export async function savePhrase(
  { repository, generateId, now }: PhraseDependencies,
  input: { text: string; label?: string },
): Promise<Phrase> {
  const phrase = createPhrase({ id: generateId(), text: input.text, label: input.label, createdAt: now() });
  await repository.save(phrase);
  return phrase;
}

export async function listPhrases(repository: PhraseRepository): Promise<Phrase[]> {
  const phrases = await repository.list();
  return [...phrases].sort((a, b) => a.createdAt - b.createdAt);
}

export async function deletePhrase(repository: PhraseRepository, id: string): Promise<void> {
  await repository.delete(id);
}

/** Saves the default phrases when the repository is empty. Returns the phrases created. */
export async function seedDefaultPhrases({ repository, generateId, now }: PhraseDependencies): Promise<Phrase[]> {
  const existing = await repository.list();
  if (existing.length > 0) return [];

  const start = now();
  const seeded = DEFAULT_PHRASE_TEXTS.map((text, index) =>
    // Offset createdAt so the default order survives sorting.
    createPhrase({ id: generateId(), text, createdAt: start + index }),
  );
  for (const phrase of seeded) await repository.save(phrase);
  return seeded;
}
