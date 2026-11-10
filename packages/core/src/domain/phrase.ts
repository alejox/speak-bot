/** A reusable piece of text the user can speak with a single tap. */
export interface Phrase {
  readonly id: string;
  readonly text: string;
  readonly label?: string;
  /** Creation time in epoch milliseconds. */
  readonly createdAt: number;
}

export interface PhraseInput {
  id: string;
  text: string;
  label?: string;
  createdAt: number;
}

export class InvalidPhraseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPhraseError";
  }
}

export function createPhrase(input: PhraseInput): Phrase {
  const id = input.id.trim();
  const text = input.text.trim();
  const label = input.label?.trim();

  if (id === "") throw new InvalidPhraseError("Phrase id must not be empty.");
  if (text === "") throw new InvalidPhraseError("Phrase text must not be empty.");

  return label ? { id, text, label, createdAt: input.createdAt } : { id, text, createdAt: input.createdAt };
}
