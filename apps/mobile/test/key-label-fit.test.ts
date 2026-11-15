import { describe, expect, it } from "vitest";
import { TEXT_SIZES } from "../src/adapters/local-storage-appearance-store";
import { estimateWordWidths, fitKeyLabel, TEXT_SIZE_SCALE, type KeyLabelFitInput } from "../src/app/key-label-fit";

/** Key sizes seen in the app: small Deck keys beside the inspector, Voice keys at each window size, a phone on its side. */
const KEY_SIZES: Array<[width: number, height: number]> = [
  [71, 71],
  [81, 113],
  [88, 88],
  [108, 108],
  [124, 124],
  [124, 171],
  [142, 190],
  [149, 208],
  [164, 164],
  [164, 230],
  [190, 135],
  [222, 310],
];
const LABELS = ["Hola", "Sí", "Gracias", "Por favor", "Transmitir", "Un momento, por favor", "¿Me puedes ayudar?", "No puedo hablar, pero sí puedo escucharte"];
const LAYOUTS: Array<Pick<KeyLabelFitInput, "stretched" | "phrase" | "hasIcon">> = [
  { stretched: true, phrase: true, hasIcon: false },
  { stretched: false, phrase: true, hasIcon: false },
  { stretched: false, phrase: false, hasIcon: true },
];
const SCALES = TEXT_SIZES.map((size) => TEXT_SIZE_SCALE[size]);

const fit = (width: number, height: number, label: string, textScale: number, layout = LAYOUTS[0]!) => fitKeyLabel({ width, height, textScale, words: estimateWordWidths(label), ...layout });

describe("the size of a key's label", () => {
  it("scales with the text-size setting, which never makes it smaller: Normal <= Large <= Extra large", () => {
    expect(SCALES).toEqual([...SCALES].sort((a, b) => a - b));
    expect(SCALES[0]).toBe(1);
    for (const layout of LAYOUTS) {
      for (const [width, height] of KEY_SIZES) {
        for (const label of LABELS) {
          const sizes = SCALES.map((scale) => fit(width, height, label, scale, layout).fontSize);
          expect(sizes, `${width}x${height} "${label}" ${JSON.stringify(layout)}`).toEqual([...sizes].sort((a, b) => a - b));
        }
      }
    }
  });

  it("is larger with a larger setting wherever the key has the room", () => {
    const [normal, , extraLarge] = SCALES.map((scale) => fit(164, 230, "Hola", scale).fontSize);
    expect(extraLarge!).toBeGreaterThan(normal!);
    expect(extraLarge! / normal!).toBeCloseTo(TEXT_SIZE_SCALE["extra-large"], 1);
  });

  it("comes from the key's size: a larger key takes larger type", () => {
    const sizes = [[81, 113], [132, 185], [164, 230], [222, 310]].map(([width, height]) => fit(width!, height!, "Gracias", 1).fontSize);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes.at(-1)!).toBeGreaterThan(sizes[0]!);
  });

  it("never asks for a size at which a word of the label is wider than the key, so no word breaks", () => {
    for (const [width, height] of KEY_SIZES) {
      for (const label of LABELS) {
        for (const scale of SCALES) {
          const result = fit(width, height, label, scale);
          const longest = Math.max(...estimateWordWidths(label));
          if (!result.breaksWords) expect(longest * result.fontSize, `${width}x${height} "${label}" x${scale}`).toBeLessThanOrEqual(width);
        }
      }
    }
    // Only a word that cannot fit at the smallest readable size may break.
    expect(fit(142, 190, "¿Me puedes ayudar?", 1).breaksWords).toBe(false);
    expect(fit(71, 71, "Pneumonoultramicroscopicsilicovolcanoconiosis", 1).breaksWords).toBe(true);
  });

  it("wraps to more lines before it shrinks, and uses as many lines as a roomy key holds", () => {
    // A phone on its side: 142x190 keys held "¿Me puedes ayudar?" at two lines and cut the long phrase.
    const short = fit(142, 190, "¿Me puedes ayudar?", 1);
    expect(short.lines).toBeGreaterThanOrEqual(3);
    const long = fit(142, 190, "No puedo hablar, pero sí puedo escucharte", 1);
    expect(long.lines).toBeGreaterThan(2);
    expect(long.fontSize).toBeGreaterThanOrEqual(15);
    // The same label on a wider key needs fewer lines, never a smaller size.
    expect(fit(222, 310, "No puedo hablar, pero sí puedo escucharte", 1).fontSize).toBeGreaterThanOrEqual(long.fontSize);
  });

  it("never goes below the smallest readable size while the words fit", () => {
    for (const [width, height] of KEY_SIZES) {
      for (const label of LABELS) expect(fit(width, height, label, 1).fontSize, `${width}x${height} "${label}"`).toBeGreaterThanOrEqual(10);
    }
    expect(fit(81, 113, "Hola", 1).fontSize).toBeGreaterThanOrEqual(12);
  });
});
