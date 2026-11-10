import {
  ACTION_TYPES,
  ACTION_REGISTRY,
  allowedActionCategories,
  isHexColor,
  KEY_ICON_IDS,
  MAX_KEY_LABEL_LENGTH,
  MAX_KEY_SLOTS,
  type Action,
  type ActionType,
  type Board,
  type BoardKind,
  type Key,
} from "@speed-deck/core";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { KeyInput } from "../adapters/board-stores";
import type { ObsServices } from "../app/composition-root";
import { draftAction, draftOf, draftToKey, KEY_COLOR_PRESETS, type KeyDraft } from "../app/key-draft";
import { useT } from "../i18n/I18nProvider";
import type { Message, MessageKey } from "../i18n/messages";
import { ActionParamsFields } from "./ActionParamsFields";
import { KeyIcon } from "./KeyIcon";

export interface KeyEditorFormProps {
  /** 0-based slot being edited. */
  slot: number;
  /** The key in that slot, or undefined for an empty slot. */
  existing: Key | undefined;
  /** An action type chosen in the library for this slot, replacing the key's action in the draft. */
  assignedType?: ActionType;
  /** Kind of the board the key is on; only the actions it allows are offered. */
  boardKind: BoardKind;
  /** Every board; a key that opens a board is offered the ones of `boardKind`. */
  boards: readonly Board[];
  obs: ObsServices | null;
  /** Resolves true when saved. */
  onSave: (key: KeyInput) => Promise<boolean>;
  /** Resolves true when deleted; without it the form offers no Delete (the key menu does). */
  onDelete?: () => Promise<boolean>;
  /** Runs the draft action right away; called synchronously inside the tap. */
  onTest: (action: Action) => void;
  /** Moves the key to another 0-based slot; resolves true when moved. */
  onMove?: (to: number) => Promise<boolean>;
  /** Shown as a Cancel button (the phone dialog). */
  onCancel?: () => void;
  /** Text of the Cancel button; "Cancel" when absent. */
  cancelLabel?: string;
  /** The action was chosen before (the add dialog): show it as text instead of a selector. */
  fixedAction?: boolean;
  /** Rendered first inside the form (e.g. the dialog title). */
  heading?: ReactNode;
}

/** Edits one key: action and its parameters, label, icon and color; tests, saves, moves and deletes it. */
export function KeyEditorForm({ slot, existing, assignedType, boardKind, boards, obs, onSave, onDelete, onTest, onMove, onCancel, cancelLabel, fixedAction = false, heading }: KeyEditorFormProps) {
  const t = useT();
  const ids = { action: useId(), label: useId(), labelHint: useId(), hex: useId(), move: useId(), confirm: useId(), error: useId() };
  const form = useRef<HTMLFormElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<KeyDraft>(() => draftOf(existing, assignedType));
  const [error, setError] = useState<{ message: Message; field: string } | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [moveTo, setMoveTo] = useState(String(slot + 1));

  useEffect(() => {
    if (isConfirmingDelete) keepButton.current?.focus();
  }, [isConfirmingDelete]);

  const update = (patch: Partial<KeyDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const fail = (message: Message, field: string) => {
    setError({ message, field });
    // Focus the field to fix, so keyboard and screen reader users land on it.
    const element = form.current;
    if (!element) return;
    const byId = field === "action" ? ids.action : field === "color" ? ids.hex : null;
    const target = byId ? element.ownerDocument.getElementById(byId) : element.querySelector<HTMLElement>(`[data-param="${field}"]`);
    target?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = draftToKey(slot, draft, t);
    if (!result.ok) {
      fail(result.error, result.field);
      return;
    }
    setIsBusy(true);
    void onSave(result.key).finally(() => setIsBusy(false));
  };

  const test = () => {
    const result = draftAction(draft, t);
    if (!result.ok) fail(result.error, result.field);
    else onTest(result.action);
  };

  const move = () => {
    const to = Number(moveTo) - 1;
    if (!Number.isInteger(to) || to < 0 || to >= MAX_KEY_SLOTS || !onMove) return;
    setIsBusy(true);
    void onMove(to).finally(() => setIsBusy(false));
  };

  const confirmDelete = () => {
    if (!onDelete) return;
    setIsBusy(true);
    void onDelete().then((deleted) => {
      setIsBusy(false);
      if (!deleted) setIsConfirmingDelete(false);
    });
  };

  // A key opens boards of its own space. A target saved before spaces stays, so editing the key does not lose it.
  const savedTargetId = existing?.action.type === "nav.goToBoard" ? existing.action.boardId : undefined;
  const targetBoards = boards.filter((board) => board.kind === boardKind || board.id === savedTargetId);
  const hexInvalid = draft.color !== "" && !isHexColor(draft.color);
  const number = slot + 1;

  return (
    <form ref={form} className="key-editor" onSubmit={submit} noValidate aria-describedby={error ? ids.error : undefined}>
      {heading}

      {fixedAction && draft.actionType ? (
        <div className="key-editor-action">
          <KeyIcon id={ACTION_REGISTRY[draft.actionType].defaultIcon} size={24} />
          <div>
            <p className="key-editor-action-name">{t(ACTION_REGISTRY[draft.actionType].labelKey as MessageKey)}</p>
            <p className="field-hint">{t(ACTION_REGISTRY[draft.actionType].descriptionKey as MessageKey)}</p>
          </div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={ids.action}>{t("editor.action")}</label>
          <select
            id={ids.action}
            value={draft.actionType}
            aria-invalid={error?.field === "action" || undefined}
            onChange={(event) => {
              const actionType = event.target.value as ActionType | "";
              update({ actionType, params: actionType && existing?.action.type === actionType ? draftOf(existing).params : {} });
            }}
          >
            <option value="">{t("editor.chooseAction")}</option>
            {allowedActionCategories(boardKind).map((category) => (
              <optgroup key={category} label={t(`category.${category}`)}>
                {ACTION_TYPES.filter((type) => ACTION_REGISTRY[type].category === category).map((type) => (
                  <option key={type} value={type}>
                    {t(ACTION_REGISTRY[type].labelKey as MessageKey)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {draft.actionType && <p className="field-hint">{t(ACTION_REGISTRY[draft.actionType].descriptionKey as MessageKey)}</p>}
        </div>
      )}

      {draft.actionType && (
        <ActionParamsFields
          actionType={draft.actionType}
          values={draft.params}
          onChange={(params) => update({ params })}
          boards={targetBoards}
          obs={obs}
          invalidField={error?.field}
        />
      )}

      <div className="field">
        <label htmlFor={ids.label}>{t("editor.label")}</label>
        <input
          id={ids.label}
          maxLength={MAX_KEY_LABEL_LENGTH}
          autoComplete="off"
          value={draft.label}
          aria-describedby={ids.labelHint}
          onChange={(event) => update({ label: event.target.value })}
        />
        <p id={ids.labelHint} className="field-hint">
          {t("editor.labelHint")}
        </p>
      </div>

      <fieldset className="picker">
        <legend>{t("editor.icon")}</legend>
        <div className="icon-picker">
          <PickerChoice name={`icon-${ids.action}`} checked={draft.icon === ""} label={t("editor.iconDefault")} onSelect={() => update({ icon: "" })}>
            <span className="picker-default" aria-hidden="true">
              {draft.actionType ? <KeyIcon id={ACTION_REGISTRY[draft.actionType].defaultIcon} size={20} /> : "—"}
            </span>
          </PickerChoice>
          {KEY_ICON_IDS.map((icon) => (
            <PickerChoice key={icon} name={`icon-${ids.action}`} checked={draft.icon === icon} label={t(`icon.${icon}`)} onSelect={() => update({ icon })}>
              <KeyIcon id={icon} size={20} />
            </PickerChoice>
          ))}
        </div>
      </fieldset>

      <fieldset className="picker">
        <legend>{t("editor.color")}</legend>
        <div className="color-picker">
          <PickerChoice name={`color-${ids.action}`} checked={draft.color === ""} label={t("editor.colorNone")} onSelect={() => update({ color: "" })}>
            <span className="swatch swatch-none" aria-hidden="true" />
          </PickerChoice>
          {KEY_COLOR_PRESETS.map((preset) => (
            <PickerChoice
              key={preset.name}
              name={`color-${ids.action}`}
              checked={draft.color.toLowerCase() === preset.value}
              label={t(`color.${preset.name}`)}
              onSelect={() => update({ color: preset.value })}
            >
              <span className="swatch" style={{ background: preset.value }} aria-hidden="true" />
            </PickerChoice>
          ))}
        </div>
        <div className="field field-inline">
          <label htmlFor={ids.hex}>{t("editor.colorHex")}</label>
          <input
            id={ids.hex}
            className="hex-input"
            maxLength={7}
            autoComplete="off"
            spellCheck={false}
            placeholder="#1a2b3c"
            value={draft.color}
            aria-invalid={hexInvalid || undefined}
            onChange={(event) => update({ color: event.target.value.trim() })}
          />
        </div>
      </fieldset>

      <p id={ids.error} className="field-error" role="alert">
        {error ? t(error.message.key, error.message.params) : ""}
      </p>

      {isConfirmingDelete ? (
        <div className="key-editor-confirm" role="group" aria-labelledby={ids.confirm}>
          <p id={ids.confirm}>{t("editor.deleteConfirm")}</p>
          <div className="key-editor-actions">
            <button type="button" className="button button-small button-danger" onClick={confirmDelete} disabled={isBusy}>
              {t("editor.deleteYes")}
            </button>
            <button ref={keepButton} type="button" className="button button-small" onClick={() => setIsConfirmingDelete(false)}>
              {t("editor.deleteNo")}
            </button>
          </div>
        </div>
      ) : (
        <div className="key-editor-actions">
          <button type="submit" className="button button-small button-primary" disabled={isBusy}>
            {t("editor.save")}
          </button>
          <button type="button" className="button button-small" onClick={test}>
            {t("editor.test")}
          </button>
          {existing && onDelete && (
            <button type="button" className="button button-small button-danger" onClick={() => setIsConfirmingDelete(true)}>
              {t("editor.delete")}
            </button>
          )}
          {onCancel && (
            <button type="button" className="button button-small" onClick={onCancel}>
              {cancelLabel ?? t("editor.cancel")}
            </button>
          )}
        </div>
      )}

      {existing && onMove && (
        <div className="field field-inline key-editor-move">
          <label htmlFor={ids.move}>{t("editor.moveTo")}</label>
          <input
            id={ids.move}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_KEY_SLOTS}
            value={moveTo}
            onChange={(event) => setMoveTo(event.target.value)}
          />
          <button type="button" className="button button-small" onClick={move} disabled={isBusy || Number(moveTo) === number}>
            {t("editor.move")}
          </button>
        </div>
      )}
    </form>
  );
}

interface PickerChoiceProps {
  name: string;
  checked: boolean;
  /** Accessible name of the choice. */
  label: string;
  onSelect: () => void;
  children: ReactNode;
}

/** A radio button drawn as a tile (an icon or a color swatch), named for screen readers. */
function PickerChoice({ name, checked, label, onSelect, children }: PickerChoiceProps) {
  return (
    <label className="picker-choice" title={label}>
      <input type="radio" className="visually-hidden" name={name} checked={checked} onChange={onSelect} aria-label={label} />
      {children}
    </label>
  );
}
