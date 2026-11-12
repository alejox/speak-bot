/** What a page of keys has to fit in: how many keys and the room they get (px). */
export interface KeyGridRoom {
  count: number;
  width: number;
  height: number;
  /** The space between two keys, across and down. */
  gap: number;
  /** How much wider than tall (or taller than wide) a key may grow; past it the key stops growing that way. */
  maxAspect?: number;
  /** The longest side a key may have, so a few keys do not fill the whole screen. */
  maxKey?: number;
}

/** The columns and rows chosen and the size of each key in them (px). */
export interface KeyGridFit {
  columns: number;
  rows: number;
  keyWidth: number;
  keyHeight: number;
}

const DEFAULT_MAX_ASPECT = 1.6;
const DEFAULT_MAX_KEY = 240;
// Sizes closer than this (px) count as the same, so the fewer empty cells decide.
const SAME_SIZE = 0.5;

/**
 * Pure: the columns × rows that give `count` keys, filled in reading order, the largest size in the room.
 * Every column count is tried; the winner has the largest shorter side, then the fewest empty cells, then
 * the squarest keys. Keys are capped by `maxAspect` and `maxKey`. So a phone on its side spreads the keys
 * across its width, and upright stacks them.
 */
export function fitKeyGrid({ count, width, height, gap, maxAspect = DEFAULT_MAX_ASPECT, maxKey = DEFAULT_MAX_KEY }: KeyGridRoom): KeyGridFit {
  const keys = Math.max(1, Math.floor(count));
  let best: (KeyGridFit & { size: number; empty: number; skew: number }) | null = null;
  for (let columns = 1; columns <= keys; columns += 1) {
    const rows = Math.ceil(keys / columns);
    // Columns that would leave a whole row empty are never better than fewer columns.
    if (columns > 1 && Math.ceil(keys / (columns - 1)) === rows) continue;
    const cellWidth = (width - (columns - 1) * gap) / columns;
    const cellHeight = (height - (rows - 1) * gap) / rows;
    if (cellWidth <= 0 || cellHeight <= 0) continue;
    const keyWidth = Math.min(cellWidth, cellHeight * maxAspect, maxKey);
    const keyHeight = Math.min(cellHeight, keyWidth * maxAspect, maxKey);
    const fittedWidth = Math.min(keyWidth, keyHeight * maxAspect);
    const candidate = {
      columns,
      rows,
      keyWidth: fittedWidth,
      keyHeight,
      size: Math.min(fittedWidth, keyHeight),
      empty: columns * rows - keys,
      skew: Math.max(fittedWidth, keyHeight) / Math.min(fittedWidth, keyHeight),
    };
    if (!best || isBetter(candidate, best)) best = candidate;
  }
  if (!best) return { columns: keys, rows: 1, keyWidth: 0, keyHeight: 0 };
  return { columns: best.columns, rows: best.rows, keyWidth: best.keyWidth, keyHeight: best.keyHeight };
}

function isBetter(candidate: { size: number; empty: number; skew: number }, best: { size: number; empty: number; skew: number }): boolean {
  if (Math.abs(candidate.size - best.size) > SAME_SIZE) return candidate.size > best.size;
  if (candidate.empty !== best.empty) return candidate.empty < best.empty;
  return candidate.skew < best.skew;
}
