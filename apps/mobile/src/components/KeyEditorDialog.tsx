import type { ActionType, BoardKind } from "@speed-deck/core";
import { useEffect, useRef, useState } from "react";
import { actionOnlyKey, needsDetails } from "../app/key-draft";
import { useT } from "../i18n/I18nProvider";
import { ActionPicker } from "./ActionPicker";
import { KeyEditorForm, type KeyEditorFormProps } from "./KeyEditorForm";
import { focusInitial, ModalDialog } from "./ModalDialog";

type KeyEditorDialogProps = Omit<KeyEditorFormProps, "onCancel" | "heading" | "assignedType" | "fixedAction" | "cancelLabel" | "variant" | "onDraftChange"> & {
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
    if (needsDetails(type)) {
      setIsDetailing(true);
      return;
    }
    if (isBusy) return;
    // Nothing to fill in: the key takes the action's own name and icon.
    const key = actionOnlyKey(form.slot, type, t);
    if (!key) return;
    setIsBusy(true);
    void form.onSave(key).finally(() => setIsBusy(false));
  };

  return (
    <div ref={container} className="modal-body-content">
      {isDetailing && chosen ? (
        <KeyEditorForm {...form} assignedType={chosen} fixedAction onCancel={() => setIsDetailing(false)} cancelLabel={t("editor.back")} />
      ) : (
        <ActionPicker boardKind={form.boardKind} query={query} onQueryChange={setQuery} focusType={chosen} onPick={pick} canAddFolder={form.canAddFolder} />
      )}
    </div>
  );
}

interface ActionPickerDialogProps {
  slot: number;
  boardKind: BoardKind;
  onPick: (type: ActionType) => void;
  onClose: () => void;
  statusText?: string;
  /** False when the board is already as deep in folders as they go. */
  canAddFolder?: boolean;
}

/** Wide screens: the + opens only the action picker; the key's details go to the inspector. */
export function ActionPickerDialog({ slot, boardKind, onPick, onClose, statusText, canAddFolder }: ActionPickerDialogProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  return (
    <ModalDialog className="key-editor-dialog" title={t("editor.addTitle", { number: slot + 1 })} onClose={onClose} statusText={statusText}>
      <ActionPicker boardKind={boardKind} query={query} onQueryChange={setQuery} onPick={onPick} canAddFolder={canAddFolder} />
    </ModalDialog>
  );
}
