import { useEffect, useId, useRef, type KeyboardEvent, type SyntheticEvent } from "react";
import { useT } from "../i18n/I18nProvider";
import { KeyEditorForm, type KeyEditorFormProps } from "./KeyEditorForm";

type KeyEditorDialogProps = Omit<KeyEditorFormProps, "onCancel" | "heading"> & {
  onClose: () => void;
  /** The current status message; the page behind a modal is inert, so the dialog repeats it in its own live region. */
  statusText?: string;
};

/**
 * The key editor as a modal (phones, the OBS dock, long press): native <dialog> with showModal
 * (focus trap, Escape closes). Focus goes back to whatever opened it.
 */
export function KeyEditorDialog({ onClose, statusText = "", ...form }: KeyEditorDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) element.showModal();
    element?.querySelector<HTMLElement>("select, input, textarea")?.focus();
    return () => {
      if (element?.open) element.close();
      // The opener may have been re-rendered; only refocus it when it is still on the page.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape and other close requests (e.g. the Android back gesture) cancel the edit.
  const cancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") cancel(event);
  };

  return (
    <dialog ref={dialog} className="key-editor-dialog" aria-labelledby={titleId} onCancel={cancel} onKeyDown={handleKeyDown}>
      <KeyEditorForm
        {...form}
        onCancel={onClose}
        heading={
          <>
            <h2 id={titleId} className="key-editor-title">
              {t("editor.dialogTitle", { number: form.slot + 1 })}
            </h2>
            <p className="status" role="status" aria-live="polite">
              {statusText}
            </p>
          </>
        }
      />
    </dialog>
  );
}
