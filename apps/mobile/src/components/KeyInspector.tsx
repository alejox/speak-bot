import { ACTION_REGISTRY, contrastTextColor, isHexColor } from "@speed-deck/core";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { draftAction, draftOf, type KeyDraft } from "../app/key-draft";
import { keyLabel, keyLook } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import { KeyEditorForm, type KeyEditorFormProps } from "./KeyEditorForm";
import { KeyIcon } from "./KeyIcon";

type KeyInspectorProps = Omit<KeyEditorFormProps, "onCancel" | "cancelLabel" | "heading" | "fixedAction" | "variant" | "onDraftChange"> & {
  onClose: () => void;
};

/**
 * The key editor as a side panel (wide screens): a large preview of the key as it will look, its name,
 * then the form. Opening it moves focus into it; closing it gives focus back to what opened it.
 */
export function KeyInspector({ onClose, ...form }: KeyInspectorProps) {
  const t = useT();
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<KeyDraft>(() => draftOf(form.existing, form.assignedType));

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = panel.current;
    // A freshly chosen action starts at its details; an existing key at its action.
    const first = (form.assignedType && element?.querySelector<HTMLElement>("[data-param]")) || element?.querySelector<HTMLElement>("select, input");
    first?.focus();
    return () => {
      if (opener?.isConnected && element?.contains(document.activeElement)) opener.focus();
    };
    // Each key or newly chosen action is a new edit; the form remounts with it.
  }, [form.slot, form.assignedType]);

  // The preview shows the draft as a key would: its label (or what it does), icon and color.
  const action = draftAction(draft, t);
  const color = isHexColor(draft.color.trim()) ? draft.color.trim().toLowerCase() : undefined;
  const preview = action.ok ? { slot: form.slot, label: draft.label.trim(), icon: draft.icon, action: action.action } : null;
  const name = preview
    ? keyLabel(preview, form.boards, t)
    : draft.actionType
      ? t(ACTION_REGISTRY[draft.actionType].labelKey as MessageKey)
      : t("inspector.label", { number: form.slot + 1 });
  const iconId = preview ? keyLook(preview).iconId : draft.icon || (draft.actionType ? ACTION_REGISTRY[draft.actionType].defaultIcon : undefined);
  const tileStyle = color ? ({ "--key-color": color, backgroundColor: color, color: contrastTextColor(color) } as CSSProperties) : undefined;

  return (
    <aside ref={panel} className="inspector" aria-label={t("inspector.label", { number: form.slot + 1 })}>
      <button type="button" className="modal-close inspector-close" aria-label={t("dialog.close")} onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
      <div className={["inspector-preview", color ? "inspector-preview-colored" : ""].filter(Boolean).join(" ")} style={tileStyle} aria-hidden="true">
        {iconId ? <KeyIcon id={iconId} size={48} /> : <span className="inspector-preview-text">{name}</span>}
      </div>
      <h2 id={headingId} className="inspector-title">
        {name}
      </h2>
      <KeyEditorForm {...form} variant="inspector" onDraftChange={setDraft} />
    </aside>
  );
}
