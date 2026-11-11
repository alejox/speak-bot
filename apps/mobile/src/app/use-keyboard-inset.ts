import { useEffect } from "react";

/** The CSS variable that holds how much of the window's bottom the on-screen keyboard covers. */
export const KEYBOARD_INSET_PROPERTY = "--keyboard-inset";

/**
 * While mounted, keeps `--keyboard-inset` on the root element up to date with the part of the window the
 * soft keyboard covers (Android shrinks only the visual viewport), so a bottom sheet can rise above it.
 * Without visualViewport (older browsers, jsdom) the inset stays 0.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    if (!viewport) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      root.style.setProperty(KEYBOARD_INSET_PROPERTY, `${Math.round(covered)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty(KEYBOARD_INSET_PROPERTY);
    };
  }, []);
}
