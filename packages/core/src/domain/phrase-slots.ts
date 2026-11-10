import { isValidSlot, type Phrase, type StoredPhrase } from "./phrase";

/** The smallest slot no phrase uses. */
export function lowestFreeSlot(phrases: readonly { readonly slot?: number }[]): number {
  const used = new Set(phrases.map((phrase) => phrase.slot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

/**
 * Gives every phrase a unique slot, returning them in slot order. Valid slots are kept (on a clash
 * the older phrase keeps it); phrases without one (older data) get the lowest free slots in creation
 * order. Deterministic, so repositories can apply it on every read and persist it on the next write.
 */
export function assignMissingSlots(phrases: readonly StoredPhrase[]): Phrase[] {
  const byAge = [...phrases].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const used = new Set<number>();
  const placed: Phrase[] = [];
  const unplaced: StoredPhrase[] = [];
  for (const phrase of byAge) {
    if (isValidSlot(phrase.slot) && !used.has(phrase.slot)) {
      used.add(phrase.slot);
      placed.push(phrase as Phrase);
    } else {
      unplaced.push(phrase);
    }
  }
  let next = 0;
  for (const phrase of unplaced) {
    while (used.has(next)) next += 1;
    used.add(next);
    placed.push({ ...phrase, slot: next });
  }
  return placed.sort((a, b) => a.slot - b.slot);
}
