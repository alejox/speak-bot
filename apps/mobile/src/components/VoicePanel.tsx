import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider";

/**
 * The Voice side panel (wide screens): the composer and the recent phrases, docked to the window's right
 * edge like the key inspector, so the Voice workspace keeps only the keys. The inspector takes its place
 * while a key is edited.
 */
export function VoicePanel({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <aside className="inspector voice-panel" aria-label={t("composer.region")}>
      {children}
    </aside>
  );
}
