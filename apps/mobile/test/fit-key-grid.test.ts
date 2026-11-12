import { describe, expect, it } from "vitest";
import { fitKeyGrid } from "../src/app/fit-key-grid";

describe("fitKeyGrid: the columns and rows that give the largest keys", () => {
  it("spreads 12 keys across a wide, short area: more columns than rows", () => {
    const fit = fitKeyGrid({ count: 12, width: 915, height: 300, gap: 8 });
    expect(fit.columns).toBeGreaterThan(fit.rows);
    expect(fit.columns * fit.rows).toBeGreaterThanOrEqual(12);
    expect(fit).toMatchObject({ columns: 6, rows: 2 });
  });

  it("stacks 12 keys in a tall, narrow area: more rows than columns", () => {
    const fit = fitKeyGrid({ count: 12, width: 380, height: 700, gap: 8 });
    expect(fit.rows).toBeGreaterThan(fit.columns);
  });

  it("gives keys larger than the board's own 3 x 4 grid would in landscape", () => {
    const fit = fitKeyGrid({ count: 12, width: 760, height: 330, gap: 8 });
    const asStored = Math.min((760 - 2 * 8) / 3, (330 - 3 * 8) / 4);
    expect(Math.min(fit.keyWidth, fit.keyHeight)).toBeGreaterThan(asStored);
  });

  it("never makes a key much wider than it is tall, nor taller than wide", () => {
    for (const [width, height] of [
      [900, 120],
      [120, 900],
      [1000, 400],
    ] as const) {
      const fit = fitKeyGrid({ count: 3, width, height, gap: 8, maxAspect: 1.6 });
      expect(fit.keyWidth / fit.keyHeight).toBeLessThanOrEqual(1.6 + 1e-9);
      expect(fit.keyHeight / fit.keyWidth).toBeLessThanOrEqual(1.6 + 1e-9);
    }
  });

  it("caps the key size so one key does not fill the screen", () => {
    const fit = fitKeyGrid({ count: 1, width: 900, height: 400, gap: 8, maxKey: 220 });
    expect(fit.keyWidth).toBeLessThanOrEqual(220);
    expect(fit.keyHeight).toBeLessThanOrEqual(220);
  });

  it("prefers fewer empty cells when two layouts give the same key size", () => {
    // 4 keys in a square: 2 x 2 (no empty cell) beats 3 x 2 (two empty).
    expect(fitKeyGrid({ count: 4, width: 400, height: 400, gap: 0 })).toMatchObject({ columns: 2, rows: 2 });
  });

  it("falls back to one column and row per key when there is no room or no key", () => {
    expect(fitKeyGrid({ count: 0, width: 500, height: 300, gap: 8 })).toMatchObject({ columns: 1, rows: 1 });
    expect(fitKeyGrid({ count: 5, width: 0, height: 0, gap: 8 })).toMatchObject({ columns: 5, rows: 1, keyWidth: 0, keyHeight: 0 });
  });
});
