import { createPhrase, type Phrase } from "../domain/phrase";
import type { PhraseRepository } from "../ports/phrase-repository";
import type { UiLanguage } from "../protocol";

export interface PhraseDependencies {
  repository: PhraseRepository;
  generateId: () => string;
  now: () => number;
}

/** English default phrases; same list as `DEFAULT_PHRASES_BY_LANGUAGE.en`. */
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

/** Default phrases for each interface language, used to seed and restore the phrase list. */
export const DEFAULT_PHRASES_BY_LANGUAGE: Readonly<Record<UiLanguage, readonly string[]>> = {
  es: [
    "Hola",
    "Gracias",
    "Sí",
    "No",
    "Por favor",
    "Un momento, por favor",
    "No puedo hablar, pero sí puedo escucharte",
    "¿Me puedes ayudar?",
  ],
  en: DEFAULT_PHRASE_TEXTS,
};

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

/** Saves the default phrases (`texts`, in order) when the repository is empty. Returns the phrases created. */
export async function seedDefaultPhrases(
  { repository, generateId, now }: PhraseDependencies,
  texts: readonly string[] = DEFAULT_PHRASE_TEXTS,
): Promise<Phrase[]> {
  const existing = await repository.list();
  if (existing.length > 0) return [];

  return saveInOrder({ repository, generateId, now }, texts);
}

/**
 * Replaces every saved phrase with `texts` (in order) in a single repository write, so concurrent
 * restores never mix their lists and a failed write keeps the previous phrases. Returns the phrases created.
 */
export async function restoreDefaultPhrases(
  { repository, generateId, now }: PhraseDependencies,
  texts: readonly string[],
): Promise<Phrase[]> {
  const created = buildInOrder(generateId, now, texts);
  await repository.replaceAll(created);
  return created;
}

async function saveInOrder({ repository, generateId, now }: PhraseDependencies, texts: readonly string[]): Promise<Phrase[]> {
  const created = buildInOrder(generateId, now, texts);
  for (const phrase of created) await repository.save(phrase);
  return created;
}

function buildInOrder(generateId: () => string, now: () => number, texts: readonly string[]): Phrase[] {
  const start = now();
  return texts.map((text, index) =>
    // Offset createdAt so the given order survives sorting.
    createPhrase({ id: generateId(), text, createdAt: start + index }),
  );
}
