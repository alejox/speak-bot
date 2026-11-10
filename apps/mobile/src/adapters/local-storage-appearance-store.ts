import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** "system" follows the device's light or dark setting. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const TEXT_SIZES = ["normal", "large", "extra-large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** How the app looks on this device. */
export interface Appearance {
  theme: ThemePreference;
  textSize: TextSize;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "system", textSize: "normal" };

export interface AppearanceStore {
  /** The defaults when the user never chose on this device. */
  load(): Appearance;
  save(appearance: Appearance): void;
}

/** Also read by the inline script in index.html, which applies the appearance before the first paint. */
export const APPEARANCE_STORAGE_KEY = "speed-deck:appearance";

const isThemePreference = (value: unknown): value is ThemePreference => (THEME_PREFERENCES as readonly unknown[]).includes(value);
const isTextSize = (value: unknown): value is TextSize => (TEXT_SIZES as readonly unknown[]).includes(value);

export class LocalStorageAppearanceStore implements AppearanceStore {
  constructor(
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly key: string = APPEARANCE_STORAGE_KEY,
  ) {}

  /** Each value is checked on its own, so one unknown value does not reset the other. */
  load(): Appearance {
    const stored = readJson(this.storage, this.key);
    if (typeof stored !== "object" || stored === null) return DEFAULT_APPEARANCE;
    const { theme, textSize } = stored as Record<string, unknown>;
    return {
      theme: isThemePreference(theme) ? theme : DEFAULT_APPEARANCE.theme,
      textSize: isTextSize(textSize) ? textSize : DEFAULT_APPEARANCE.textSize,
    };
  }

  save(appearance: Appearance): void {
    writeJson(this.storage, this.key, appearance);
  }
}
