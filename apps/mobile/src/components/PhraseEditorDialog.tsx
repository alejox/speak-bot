import { MAX_PHRASE_TEXT_LENGTH, type Phrase } from "@speak-bot/core";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import type { PhraseValues } from "../app/use-phrase-book";
import { useT } from "../i18n/I18nProvider";

/** Short labels keep deck keys readable; the full text is still spoken. */
export const MAX_KEY_LABEL_LENGTH = 40;

interface PhraseEditorDialogProps {
  /** 0-based deck slot being edited. */
  slot: number;
  /** The phrase in that slot, or undefined to add a new one. */
  phrase: Phrase | undefined;
  /** Resolves true when saved, which closes the editor. */
  onSave: (values: PhraseValues) => Promise<boolean>;
  /** Resolves true when deleted, which closes the editor. */
  onDelete: () => Promise<boolean>;
  /** Speaks the text right away; must be called synchronously inside the tap. */
  onTest: (text: string) => void;
  onClose: () => void;
}

/** Modal editor for one deck key: native <dialog> (focus trap, Escape closes) with an inline delete confirmation. */
export function PhraseEditorDialog({ slot, phrase, onSave, onDelete, onTest, onClose }: PhraseEditorDialogProps) {
  const t = useT();
  const titleId = useId();
  const textId = useId();
  const labelId = useId();
  const labelHintId = useId();
  const confirmId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState(phrase?.text ?? "");
  const [label, setLabel] = useState(phrase?.label ?? "");
  const [showRequired, setShowRequired] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const wasConfirming = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    textArea.current?.focus();
    return () => {
      if (element?.open) element.close();
    };
  }, []);

  // Focus the safe choice when asking to delete, and the Delete button again afterwards.
  useEffect(() => {
    if (isConfirmingDelete) keepButton.current?.focus();
    else if (wasConfirming.current) deleteButton.current?.focus();
    wasConfirming.current = isConfirmingDelete;
  }, [isConfirmingDelete]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (text.trim() === "") {
      setShowRequired(true);
      textArea.current?.focus();
      return;
    }
    setIsBusy(true);
    void onSave({ text, label }).then((saved) => {
      setIsBusy(false);
      if (saved) onClose();
    });
  };

  const confirmDelete = () => {
    setIsBusy(true);
    void onDelete().then((deleted) => {
      setIsBusy(false);
      if (deleted) onClose();
      else setIsConfirmingDelete(false);
    });
  };

  // Escape and other close requests (e.g. the Android back gesture) cancel the edit.
  const cancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") cancel(event);
  };

  const number = slot + 1;
  return (
    <dialog ref={dialog} className="phrase-editor" aria-labelledby={titleId} onCancel={cancel} onKeyDown={handleKeyDown}>
      <form className="phrase-editor-form" onSubmit={submit} noValidate>
        <h2 id={titleId} className="phrase-editor-title">
          {phrase ? t("editor.editTitle", { number }) : t("editor.addTitle", { number })}
        </h2>

        <label htmlFor={textId} className="field-label">
          {t("editor.text")}
        </label>
        <textarea
          id={textId}
          ref={textArea}
          className="phrase-editor-text"
          rows={3}
          required
          maxLength={MAX_PHRASE_TEXT_LENGTH}
          value={text}
          aria-invalid={showRequired && text.trim() === ""}
          onChange={(event) => setText(event.target.value)}
        />
        {showRequired && text.trim() === "" && (
          <p className="field-error" role="alert">
            {t("editor.textRequired")}
          </p>
        )}

        <label htmlFor={labelId} className="field-label">
          {t("editor.label")}
        </label>
        <input
          id={labelId}
          className="phrase-editor-label"
          maxLength={MAX_KEY_LABEL_LENGTH}
          value={label}
          aria-describedby={labelHintId}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
        />
        <p id={labelHintId} className="field-hint">
          {t("editor.labelHint")}
        </p>

        {isConfirmingDelete ? (
          <div className="phrase-editor-confirm" role="group" aria-labelledby={confirmId}>
            <p id={confirmId}>{t("editor.deleteConfirm")}</p>
            <div className="phrase-editor-actions">
              <button type="button" className="button button-small button-danger" onClick={confirmDelete} disabled={isBusy}>
                {t("editor.deleteYes")}
              </button>
              <button ref={keepButton} type="button" className="button button-small" onClick={() => setIsConfirmingDelete(false)}>
                {t("editor.deleteNo")}
              </button>
            </div>
          </div>
        ) : (
          <div className="phrase-editor-actions">
            <button type="submit" className="button button-small button-primary" disabled={isBusy}>
              {t("editor.save")}
            </button>
            <button type="button" className="button button-small" onClick={() => onTest(text)} disabled={text.trim() === ""}>
              {t("editor.test")}
            </button>
            {phrase && (
              <button
                ref={deleteButton}
                type="button"
                className="button button-small button-danger"
                onClick={() => setIsConfirmingDelete(true)}
              >
                {t("editor.delete")}
              </button>
            )}
            <button type="button" className="button button-small" onClick={onClose}>
              {t("editor.cancel")}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
