import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import { useT } from "../i18n/I18nProvider";

interface ModalDialogProps {
  title: ReactNode;
  onClose: () => void;
  /** The current status message; the page behind a modal is inert, so the dialog repeats it in its own live region. */
  statusText?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A modal shell: native <dialog> with showModal (focus trap, Escape and the Android back gesture close it),
 * a title, a close button and a live region. Focus goes to the first field, or the element marked
 * `data-autofocus`, and back to whatever opened the dialog when it closes.
 */
export function ModalDialog({ title, onClose, statusText = "", className, children }: ModalDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) element.showModal();
    focusInitial(element);
    return () => {
      if (element?.open) element.close();
      // The opener may have been re-rendered; only refocus it when it is still on the page.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const cancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") cancel(event);
  };

  return (
    <dialog ref={dialog} className={["modal", className ?? ""].filter(Boolean).join(" ")} aria-labelledby={titleId} onCancel={cancel} onKeyDown={handleKeyDown}>
      <div className="modal-header">
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <button type="button" className="modal-close" aria-label={t("dialog.close")} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="status modal-status" role="status" aria-live="polite">
        {statusText}
      </p>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

/** Focuses what a dialog's content asks for: `data-autofocus`, else its first field. */
export function focusInitial(container: HTMLElement | null) {
  const target =
    container?.querySelector<HTMLElement>("[data-autofocus]") ?? container?.querySelector<HTMLElement>(".modal-body select, .modal-body input, .modal-body textarea");
  target?.focus();
}
