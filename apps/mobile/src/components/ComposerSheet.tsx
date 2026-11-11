import type { ReactNode } from "react";
import { useKeyboardInset } from "../app/use-keyboard-inset";
import { useT } from "../i18n/I18nProvider";
import { ModalDialog } from "./ModalDialog";

interface ComposerSheetProps {
  /** The status message, repeated inside since the page behind a modal is inert. */
  statusText: string;
  onClose: () => void;
  /** The composer and the recent phrases, the same ones the larger layouts show inline. */
  children: ReactNode;
}

/**
 * Presentational: the composer on a phone, as a modal sheet docked to the bottom of the window and lifted
 * above the soft keyboard. Focus starts in the text box; Escape, the back gesture and Close put it away.
 * Speaking leaves it open, so the person can keep talking.
 */
export function ComposerSheet({ statusText, onClose, children }: ComposerSheetProps) {
  const t = useT();
  useKeyboardInset();
  return (
    <ModalDialog title={t("composer.write")} onClose={onClose} statusText={statusText} className="composer-sheet">
      {children}
    </ModalDialog>
  );
}
