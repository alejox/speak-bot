import { useLayoutEffect, useState } from "react";
import { applyAppearance } from "../adapters/appearance-dom";
import type { Appearance, AppearanceStore } from "../adapters/local-storage-appearance-store";

export interface AppearancePreference {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
}

/**
 * This device's theme and text size. The choice is applied to the root element before the browser
 * paints, so the stylesheet (which reads it from there) never shows the previous look.
 */
export function useAppearance(store: AppearanceStore): AppearancePreference {
  const [appearance, setChoice] = useState<Appearance>(() => store.load());
  useLayoutEffect(() => applyAppearance(appearance), [appearance]);
  return {
    appearance,
    setAppearance: (next) => {
      setChoice(next);
      store.save(next);
    },
  };
}
