import { useLayoutEffect, useState, type RefObject } from "react";
import { estimateWordWidths } from "./key-label-fit";

/** One key of a page as it is drawn: its size, and the font its label is set in. */
export interface KeyBox {
  width: number;
  height: number;
  fontFamily: string;
  fontWeight: string;
}

/** Keys that are plain buttons with a label: every one of a page has the same box. Volume keys and empty cells are not. */
const KEY_SELECTOR = ":scope > li > button.deck-key:not(.deck-key-empty)";
const REFERENCE_PX = 100;

const widths = new Map<string, number[]>();
let canvas: CanvasRenderingContext2D | null | undefined;

/** A 2D context to measure text with, or null where there is none (then widths are estimated). */
function measuringContext(): CanvasRenderingContext2D | null {
  if (canvas === undefined) {
    try {
      canvas = document.createElement("canvas").getContext("2d");
    } catch {
      canvas = null;
    }
  }
  return canvas;
}

/** The width of each word of `label` at 1em in the key's font, in em; remembered per label and font. */
export function measureWordWidths(label: string, box: Pick<KeyBox, "fontFamily" | "fontWeight">): number[] {
  const id = `${box.fontWeight}|${box.fontFamily}|${label}`;
  const known = widths.get(id);
  if (known) return known;
  const context = measuringContext();
  let measured = estimateWordWidths(label);
  if (context) {
    context.font = `${box.fontWeight} ${REFERENCE_PX}px ${box.fontFamily}`;
    measured = label
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => context.measureText(word).width / REFERENCE_PX);
  }
  widths.set(id, measured);
  return measured;
}

/**
 * Follows the box of a key of the page drawn in `grid`, so its labels can be sized for it (`fitKeyLabel`).
 * Null where nothing can be measured (no keys on the page, no layout as in tests): the styles then size
 * the labels on their own. `page` names what is drawn (board, page, layout), so a new page is measured again.
 */
export function useKeyBox(grid: RefObject<HTMLElement | null>, page: string, enabled: boolean): KeyBox | null {
  const [box, setBox] = useState<KeyBox | null>(null);
  // Text measured before the interface font arrived was measured in another font.
  const [, setFontsLoaded] = useState(0);

  useLayoutEffect(() => {
    const element = grid.current;
    if (!enabled || !element || typeof ResizeObserver === "undefined") {
      setBox(null);
      return;
    }
    const measure = () => {
      const key = element.querySelector<HTMLElement>(KEY_SELECTOR);
      const rect = key?.getBoundingClientRect();
      if (!key || !rect || rect.width === 0 || rect.height === 0) return setBox(null);
      const style = getComputedStyle(key);
      const next: KeyBox = { width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10, fontFamily: style.fontFamily, fontWeight: style.fontWeight };
      setBox((current) =>
        current && current.width === next.width && current.height === next.height && current.fontFamily === next.fontFamily && current.fontWeight === next.fontWeight ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const key = element.querySelector<HTMLElement>(KEY_SELECTOR);
    if (key) observer.observe(key);
    const fonts = document.fonts;
    const remeasureText = () => {
      widths.clear();
      setFontsLoaded((count) => count + 1);
    };
    fonts?.addEventListener?.("loadingdone", remeasureText);
    return () => {
      observer.disconnect();
      fonts?.removeEventListener?.("loadingdone", remeasureText);
    };
  }, [grid, page, enabled]);

  return box;
}
