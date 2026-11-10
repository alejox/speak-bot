import { createPhrase, PhraseNotFoundError, SlotOccupiedError, type Phrase } from "../domain/phrase";
import { lowestFreeSlot } from "../domain/phrase-slots";
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

/**
 * Creates a phrase in `slot`, or in the lowest free slot when none is given.
 * Rejects with `SlotOccupiedError` when another phrase already uses that slot.
 */
export async function savePhrase(
  { repository, generateId, now }: PhraseDependencies,
  input: { text: string; label?: string; slot?: number },
): Promise<Phrase> {
  const existing = await repository.list();
  const slot = input.slot ?? lowestFreeSlot(existing);
  const phrase = createPhrase({ id: generateId(), text: input.text, label: input.label, slot, createdAt: now() });
  if (existing.some((other) => other.slot === phrase.slot)) throw new SlotOccupiedError(phrase.slot);
  await repository.save(phrase);
  return phrase;
}

export interface PhraseChanges {
  text?: string;
  /** An empty label removes it. */
  label?: string;
  slot?: number;
}

/**
 * Changes an existing phrase. Fields left out keep their value. Rejects with `PhraseNotFoundError`,
 * `InvalidPhraseError` or `SlotOccupiedError` without writing anything.
 */
export async function updatePhrase(repository: PhraseRepository, id: string, changes: PhraseChanges): Promise<Phrase> {
  const phrases = await repository.list();
  const current = phrases.find((phrase) => phrase.id === id);
  if (!current) throw new PhraseNotFoundError(id);
  const updated = createPhrase({
    id: current.id,
    text: changes.text ?? current.text,
    label: changes.label ?? current.label,
    slot: changes.slot ?? current.slot,
    createdAt: current.createdAt,
  });
  if (phrases.some((other) => other.id !== id && other.slot === updated.slot)) throw new SlotOccupiedError(updated.slot);
  await repository.update(updated);
  return updated;
}

/** Phrases in deck order (by slot). */
export async function listPhrases(repository: PhraseRepository): Promise<Phrase[]> {
  const phrases = await repository.list();
  return [...phrases].sort((a, b) => a.slot - b.slot);
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
    // Slots follow the given order; createdAt is offset too so the order survives sorting by age.
    createPhrase({ id: generateId(), text, slot: index, createdAt: start + index }),
  );
}
