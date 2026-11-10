import { ACTION_REGISTRY, type ActionType } from "@speed-deck/core";
import { useEffect, useRef, useState } from "react";
import { draftOf, draftToKey } from "../app/key-draft";
import { useT } from "../i18n/I18nProvider";
import { ActionPicker } from "./ActionPicker";
import { KeyEditorForm, type KeyEditorFormProps } from "./KeyEditorForm";
import { focusInitial, ModalDialog } from "./ModalDialog";

type KeyEditorDialogProps = Omit<KeyEditorFormProps, "onCancel" | "heading" | "assignedType" | "fixedAction" | "cancelLabel"> & {
  onClose: () => void;
  /** The current status message, repeated in the dialog's own live region. */
  statusText?: string;
};

/**
 * The key dialog. On an empty slot it adds a key in two steps: pick an action (one without parameters
 * is saved right away), then fill in its details. On a key it edits the key.
 */
export function KeyEditorDialog({ onClose, statusText, ...form }: KeyEditorDialogProps) {
  const t = useT();
  const number = form.slot + 1;
  return (
    <ModalDialog
      className="key-editor-dialog"
      title={form.existing ? t("editor.dialogTitle", { number }) : t("editor.addTitle", { number })}
      onClose={onClose}
      statusText={statusText}
    >
      {form.existing ? <KeyEditorForm {...form} onCancel={onClose} /> : <AddKeySteps {...form} />}
    </ModalDialog>
  );
}

type AddKeyStepsProps = Omit<KeyEditorDialogProps, "onClose" | "statusText">;

function AddKeySteps(form: AddKeyStepsProps) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ActionType | undefined>(undefined);
  const [isDetailing, setIsDetailing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isFirstStep = useRef(true);

  // Each step starts with focus on its first control; the dialog itself focuses the first one it shows.
  useEffect(() => {
    if (isFirstStep.current) {
      isFirstStep.current = false;
      return;
    }
    focusInitial(container.current);
  }, [isDetailing]);

  const pick = (type: ActionType) => {
    setChosen(type);
    if (ACTION_REGISTRY[type].params.length > 0) {
      setIsDetailing(true);
      return;
    }
    if (isBusy) return;
    // Nothing to fill in: the key takes the action's own name and icon.
    const result = draftToKey(form.slot, draftOf(undefined, type), t);
    if (!result.ok) return;
    setIsBusy(true);
    void form.onSave(result.key).finally(() => setIsBusy(false));
  };

  return (
    <div ref={container} className="modal-body-content">
      {isDetailing && chosen ? (
        <KeyEditorForm {...form} assignedType={chosen} fixedAction onCancel={() => setIsDetailing(false)} cancelLabel={t("editor.back")} />
      ) : (
        <ActionPicker boardKind={form.boardKind} query={query} onQueryChange={setQuery} focusType={chosen} onPick={pick} />
      )}
    </div>
  );
}
