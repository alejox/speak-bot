/** A reusable piece of text the user can speak with a single tap. */
export interface Phrase {
  readonly id: string;
  readonly text: string;
  readonly label?: string;
  /** Position on the phrase deck: a 0-based index across all pages. Unique per phrase list. */
  readonly slot: number;
  /** Creation time in epoch milliseconds. */
  readonly createdAt: number;
}

export interface PhraseInput {
  id: string;
  text: string;
  label?: string;
  slot: number;
  createdAt: number;
}

/** A phrase as stored by older versions, which had no deck slot yet. */
export type StoredPhrase = Omit<Phrase, "slot"> & { readonly slot?: number };

/** Longest phrase text, matching the longest text the desktop speaks at once. */
export const MAX_PHRASE_TEXT_LENGTH = 1000;
/** Longest short label shown on a deck key. */
export const MAX_PHRASE_LABEL_LENGTH = 100;
/** Number of deck slots (100 pages of 15 keys). */
export const MAX_PHRASE_SLOTS = 1500;

export class InvalidPhraseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPhraseError";
  }
}

/** Another phrase already sits in the requested deck slot. */
export class SlotOccupiedError extends Error {
  constructor(readonly slot: number) {
    super(`Slot ${slot} already holds a phrase.`);
    this.name = "SlotOccupiedError";
  }
}

export class PhraseNotFoundError extends Error {
  constructor(readonly id: string) {
    super("Phrase not found.");
    this.name = "PhraseNotFoundError";
  }
}

export function isValidSlot(slot: unknown): slot is number {
  return typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < MAX_PHRASE_SLOTS;
}

export function createPhrase(input: PhraseInput): Phrase {
  const id = input.id.trim();
  const text = input.text.trim();
  const label = input.label?.trim();
  const { slot, createdAt } = input;

  if (id === "") throw new InvalidPhraseError("Phrase id must not be empty.");
  if (text === "") throw new InvalidPhraseError("Phrase text must not be empty.");
  if (text.length > MAX_PHRASE_TEXT_LENGTH) {
    throw new InvalidPhraseError(`Phrase text must be at most ${MAX_PHRASE_TEXT_LENGTH} characters.`);
  }
  if (label && label.length > MAX_PHRASE_LABEL_LENGTH) {
    throw new InvalidPhraseError(`Phrase label must be at most ${MAX_PHRASE_LABEL_LENGTH} characters.`);
  }
  if (!isValidSlot(slot)) throw new InvalidPhraseError(`Phrase slot must be an integer from 0 to ${MAX_PHRASE_SLOTS - 1}.`);

  return label ? { id, text, label, slot, createdAt } : { id, text, slot, createdAt };
}
