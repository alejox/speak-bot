import type { TextSize } from "../adapters/local-storage-appearance-store";

/**
 * How much each text-size setting enlarges a key's label over Normal: the ratios the setting applies to the
 * rest of the interface (tokens.css). Never below 1, so raising the setting can only enlarge a label.
 */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { normal: 1, large: 1.111, "extra-large": 1.278 };

/** Line height of a key label (--leading-tight). */
const LEADING = 1.2;
/** A label is not made smaller than this to fit more of a phrase; a phrase that still does not fit is cut with an ellipsis. */
const READABLE_SIZE = 12;
/** Only a word wider than its key at the readable size goes below it, down to this; past it the word has to break. */
const SMALLEST_SIZE = 10;
/** Width of a space between two words, in em. */
const SPACE_EM = 0.28;
/** The label keeps this share of the key's inner width: text metrics are measured, never exact. */
const WIDTH_SLACK = 0.96;
/** A line under the label (the current voice language), as a share of a label line. */
const DETAIL_LINES = 0.9;

export interface KeyLabelFitInput {
  /** The key's box on screen, in px. */
  width: number;
  height: number;
  /** From the text-size setting (`TEXT_SIZE_SCALE`). */
  textScale: number;
  /** The width of each word of the label at 1em, in em (measured, or `estimateWordWidths`). */
  words: readonly number[];
  /** A key that fills its cell (Voice): it may be far from square and takes larger type than a square Deck key. */
  stretched: boolean;
  /** A phrase is text first; a command's label sits under its icon and is a little smaller. */
  phrase: boolean;
  /** An icon is drawn above the label. */
  hasIcon: boolean;
  /** A short line is drawn under the label. */
  hasDetail?: boolean;
}

export interface KeyLabelFit {
  /** px. */
  fontSize: number;
  /** Lines of that size the key holds: the label may use them all before it is cut with an ellipsis. */
  lines: number;
  /** A word is wider than the key even at the smallest size: only then may a word break. */
  breaksWords: boolean;
}

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

/** A rough width for each word of `label` at 1em, where the text cannot be measured (tests, no canvas). */
export function estimateWordWidths(label: string): number[] {
  return label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word].length * 0.58);
}

/** The room a key leaves its label, in px, as the styles lay the key out (deck.css, compact.css). */
function labelRoom({ width, height, stretched, hasIcon }: KeyLabelFitInput): { width: number; height: number } {
  const side = stretched ? Math.min(width, height) : width;
  const padding = stretched ? clamp(4, side * 0.07, 12) : clamp(2, side * 0.06, 12);
  const border = 1;
  const gap = clamp(1, side * 0.04, 8);
  const icon = hasIcon ? (stretched ? clamp(14, side * 0.22, 36) : clamp(12, side * 0.24, 32)) + gap : 0;
  return { width: (width - 2 * padding - 2 * border) * WIDTH_SLACK, height: height - 2 * padding - 2 * border - icon };
}

/** Lines the words take at `fontSize` in `width`, wrapping between words only. */
function wrappedLines(words: readonly number[], fontSize: number, width: number): number {
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const wordWidth = word * fontSize;
    const next = used === 0 ? wordWidth : used + SPACE_EM * fontSize + wordWidth;
    if (used > 0 && next > width) {
      lines += 1;
      used = wordWidth;
    } else used = next;
  }
  return lines;
}

/**
 * The size of a key's label and the lines it may take.
 *
 * The size comes from the key (a share of its shorter side, within limits) and is multiplied by the
 * text-size setting. It then only gives way to the key itself: never so large that the longest word is
 * wider than the key (so no word breaks), and when the whole label does not fit, it first wraps onto as
 * many lines as the key holds and only then shrinks, down to a readable size.
 *
 * The limits the key sets do not depend on the setting, so a larger setting never gives a smaller label.
 */
export function fitKeyLabel(input: KeyLabelFitInput): KeyLabelFit {
  const { width, height, textScale, words, stretched, phrase, hasDetail = false } = input;
  const side = stretched ? Math.min(width, height) : width;
  // From the key: larger keys take larger type, up to a size that still reads as a key label.
  const fromKey = stretched ? clamp(READABLE_SIZE, side * 0.17, 28) : phrase ? clamp(14, side * 0.15, 18) : clamp(13, side * 0.13, 16);
  const wanted = fromKey * Math.max(1, textScale);
  const room = labelRoom(input);
  const longest = words.length ? Math.max(...words) : 0;
  // The largest size at which the longest word still fits on a line.
  const wordLimit = longest > 0 ? room.width / longest : Number.POSITIVE_INFINITY;
  const linesAt = (fontSize: number) => Math.floor(room.height / (fontSize * LEADING) - (hasDetail ? DETAIL_LINES : 0));
  const fits = (fontSize: number) => fontSize <= wordLimit && wrappedLines(words, fontSize, room.width) <= linesAt(fontSize);

  // The largest size at which the whole label shows: every word on a line, on the lines the key holds.
  let wholeLimit = 0;
  if (fits(SMALLEST_SIZE)) {
    let low = SMALLEST_SIZE;
    let high = 96;
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    wholeLimit = low;
  }
  // A label too long for the key stays readable and is cut; a word too wide for it may go a little smaller.
  const limit = Math.max(wholeLimit, Math.min(READABLE_SIZE, wordLimit), SMALLEST_SIZE);
  const fontSize = Math.round(Math.min(wanted, limit) * 100) / 100;
  return { fontSize, lines: Math.max(1, linesAt(fontSize)), breaksWords: wordLimit < SMALLEST_SIZE };
}
