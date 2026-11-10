import type { UiLanguage } from "@speed-deck/core";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { LanguageStore } from "../src/adapters/local-storage-language-store";
import { I18nProvider } from "../src/i18n/I18nProvider";

/** A language store with a fixed initial choice (null = never chosen) that records saves. */
export function memoryLanguageStore(initial: UiLanguage | null = "en"): LanguageStore & { saved: UiLanguage[] } {
  let current = initial;
  const saved: UiLanguage[] = [];
  return {
    saved,
    load: () => current,
    save: (language) => {
      current = language;
      saved.push(language);
    },
  };
}

/** Renders a presentational component inside the i18n provider (English by default). */
export function renderWithLanguage(ui: ReactElement, language: UiLanguage = "en") {
  return render(<I18nProvider language={language}>{ui}</I18nProvider>);
}

/** Opens a section from the navigation menu. */
export async function goTo(user: { click: (element: Element) => Promise<void> }, section: string) {
  const { screen } = await import("@testing-library/react");
  await user.click(screen.getByRole("link", { name: section }));
}
