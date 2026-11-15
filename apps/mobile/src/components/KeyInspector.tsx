import { ACTION_REGISTRY, contrastTextColor, isHexColor } from "@speed-deck/core";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { draftAction, draftOf, type KeyDraft } from "../app/key-draft";
import { keyLabel, keyLook } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import { KeyEditorForm, type KeyEditorFormProps } from "./KeyEditorForm";
import { KeyIcon } from "./KeyIcon";
import { ModalDialog } from "./ModalDialog";

type KeyInspectorProps = Omit<KeyEditorFormProps, "onCancel" | "cancelLabel" | "heading" | "fixedAction" | "variant" | "onDraftChange"> & {
  onClose: () => void;
};

/** A draft as text, to tell whether anything in it changed. */
const snapshot = (draft: KeyDraft) => JSON.stringify(draft);

/**
 * The key editor as a side panel (wide screens): a large preview of the key as it will look, its name,
 * then the form. Opening it moves focus into it; closing it (the Close button or Escape) gives focus back
 * to the key or cell it came from. A draft that was edited is never thrown away without asking.
 */
export function KeyInspector({ onClose, ...form }: KeyInspectorProps) {
  const t = useT();
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<KeyDraft>(() => draftOf(form.existing, form.assignedType));
  // The draft as it was opened or last saved; anything else is an edit that closing would lose.
  const [savedDraft, setSavedDraft] = useState(() => snapshot(draft));
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const [isAskingToDiscard, setIsAskingToDiscard] = useState(false);
  const { slot, assignedType, onSave } = form;

  useEffect(() => {
    const element = panel.current;
    const opener = document.activeElement instanceof HTMLElement && !element?.contains(document.activeElement) ? document.activeElement : null;
    // A freshly chosen action starts at its details; an existing key at its action.
    const first = (assignedType && element?.querySelector<HTMLElement>("[data-param]")) || element?.querySelector<HTMLElement>("select, input");
    first?.focus();
    return () => {
      // Runs once the panel is gone: focus that was inside it has nowhere to be. Focus the person moved elsewhere stays there.
      const active = document.activeElement;
      if (active && active !== document.body && !element?.contains(active)) return;
      // What opened it, or the cell itself when that is gone (a + that became a key).
      const cell = opener?.isConnected ? opener : document.querySelector<HTMLElement>(`.deck-grid [data-slot="${slot}"] > .deck-key`);
      cell?.focus();
    };
    // Each key or newly chosen action is a new edit; the panel remounts with it.
  }, [slot, assignedType]);

  const requestClose = () => {
    if (snapshot(draft) === savedDraft) onClose();
    else setIsAskingToDiscard(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    requestClose();
  };

  // The preview shows the draft as a key would: its label (or what it does), icon and color.
  const action = draftAction(draft, t);
  const color = isHexColor(draft.color.trim()) ? draft.color.trim().toLowerCase() : undefined;
  const preview = action.ok ? { slot, label: draft.label.trim(), icon: draft.icon, action: action.action } : null;
  const name = preview
    ? keyLabel(preview, form.boards, t)
    : draft.actionType
      ? t(ACTION_REGISTRY[draft.actionType].labelKey as MessageKey)
      : t("inspector.label", { number: slot + 1 });
  const iconId = preview ? keyLook(preview).iconId : draft.icon || (draft.actionType ? ACTION_REGISTRY[draft.actionType].defaultIcon : undefined);
  const tileStyle = color ? ({ "--key-color": color, backgroundColor: color, color: contrastTextColor(color) } as CSSProperties) : undefined;

  return (
    <>
      <aside ref={panel} className="inspector" aria-label={t("inspector.label", { number: slot + 1 })} onKeyDown={handleKeyDown}>
        <button type="button" className="modal-close inspector-close" aria-label={t("dialog.close")} onClick={requestClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className={["inspector-preview", color ? "inspector-preview-colored" : ""].filter(Boolean).join(" ")} style={tileStyle} aria-hidden="true">
          {iconId ? <KeyIcon id={iconId} size={48} /> : <span className="inspector-preview-text">{name}</span>}
        </div>
        <h2 id={headingId} className="inspector-title">
          {name}
        </h2>
        <KeyEditorForm
          {...form}
          variant="inspector"
          onDraftChange={setDraft}
          onSave={async (key) => {
            const saved = await onSave(key);
            // What was saved is no longer an edit to lose.
            if (saved) setSavedDraft(snapshot(latestDraft.current));
            return saved;
          }}
        />
      </aside>
      {isAskingToDiscard && (
        <ModalDialog title={t("inspector.discardTitle")} onClose={() => setIsAskingToDiscard(false)} className="modal-small">
          <p className="modal-prompt">{t("inspector.discardPrompt")}</p>
          <div className="modal-actions">
            <button type="button" className="button" data-autofocus onClick={() => setIsAskingToDiscard(false)}>
              {t("inspector.discardNo")}
            </button>
            <button type="button" className="button button-danger-text" onClick={onClose}>
              {t("inspector.discardYes")}
            </button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
