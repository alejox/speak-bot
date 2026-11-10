import type { Appearance } from "./local-storage-appearance-store";

/**
 * The browser chrome colour per theme: the header surface (`--color-surface` in styles/tokens.css).
 * Keep in step with the stylesheet and with the theme-color metas in index.html.
 */
export const THEME_COLORS = { light: "#ffffff", dark: "#171b22" } as const;

/**
 * Applies the appearance where the stylesheet reads it: `data-theme` and `data-text-size` on the root
 * element. The system theme and the normal size leave no attribute, so the stylesheet defaults apply.
 * A manual theme also overrides the theme-color metas, which otherwise follow the device setting.
 */
export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement, head: ParentNode = document.head): void {
  if (appearance.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", appearance.theme);

  if (appearance.textSize === "normal") root.removeAttribute("data-text-size");
  else root.setAttribute("data-text-size", appearance.textSize);

  for (const meta of head.querySelectorAll('meta[name="theme-color"]')) {
    const own = meta.getAttribute("media")?.includes("dark") ? "dark" : "light";
    meta.setAttribute("content", THEME_COLORS[appearance.theme === "system" ? own : appearance.theme]);
  }
}
