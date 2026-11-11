import {
  ACTION_TYPES,
  ACTION_REGISTRY,
  allowedActionCategories,
  gridOfBoards,
  isHexColor,
  keysPerPage,
  KEY_ICON_IDS,
  MAX_BOARD_PAGES,
  MAX_KEY_LABEL_LENGTH,
  MAX_KEY_SPAN_COLUMNS,
  MAX_KEY_SPAN_ROWS,
  visibleBoards,
  type Action,
  type ActionType,
  type Board,
  type BoardKind,
  type Key,
  type Application,
} from "@speed-deck/core";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { KeyInput } from "../adapters/board-stores";
import type { ObsServices } from "../app/composition-root";
import { draftAction, draftOf, draftToKey, KEY_COLOR_PRESETS, type KeyDraft } from "../app/key-draft";
import { hasOnState } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import type { Message, MessageKey } from "../i18n/messages";
import { ActionParamsFields } from "./ActionParamsFields";
import { KeyIcon } from "./KeyIcon";
import { MultiActionSteps } from "./MultiActionSteps";

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
  /** Lists the computer's applications for "open application" keys; null or absent in phone-only mode. */
  listApplications?: (() => Promise<Application[]>) | null;
  /** Resolves true when saved. */
  onSave: (key: KeyInput) => Promise<boolean>;
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
  /** "inspector" is the wide-screen side panel: the name after the pickers and one full-width Save. */
  variant?: "dialog" | "inspector";
  /** Called with the draft as it changes (the inspector's live preview). */
  onDraftChange?: (draft: KeyDraft) => void;
  /** Rendered first inside the form (e.g. the dialog title). */
  heading?: ReactNode;
  /** False when the board is already as deep in folders as they go: Folder is not offered. */
  canAddFolder?: boolean;
}

/** Edits one key: action and its parameters, label, icon and color (and its color when on, for keys with an on state); tests, saves and moves it. Deleting lives in the key menu. */
export function KeyEditorForm({
  slot,
  existing,
  assignedType,
  boardKind,
  boards,
  obs,
  listApplications,
  onSave,
  onTest,
  onMove,
  onCancel,
  cancelLabel,
  fixedAction = false,
  variant = "dialog",
  onDraftChange,
  heading,
  canAddFolder = true,
}: KeyEditorFormProps) {
  const t = useT();
  const ids = { action: useId(), spanRows: useId(), spanColumns: useId(), spanHint: useId(), label: useId(), labelHint: useId(), hex: useId(), activeHex: useId(), move: useId(), error: useId() };
  const form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<KeyDraft>(() => draftOf(existing, assignedType));
  const [error, setError] = useState<{ message: Message; field: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [moveTo, setMoveTo] = useState(String(slot + 1));

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const update = (patch: Partial<KeyDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const fail = (message: Message, field: string) => {
    setError({ message, field });
    // Focus the field to fix, so keyboard and screen reader users land on it.
    const element = form.current;
    if (!element) return;
    const byId = field === "action" ? ids.action : field === "color" ? ids.hex : field === "activeColor" ? ids.activeHex : null;
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

  // Boards of one kind share one grid, so a key can move to any slot of the pages a board may have.
  const slotCount = keysPerPage(gridOfBoards(boards, boardKind)) * MAX_BOARD_PAGES;
  const move = () => {
    const to = Number(moveTo) - 1;
    if (!Number.isInteger(to) || to < 0 || to >= slotCount || !onMove) return;
    setIsBusy(true);
    void onMove(to).finally(() => setIsBusy(false));
  };

  // A key opens boards of its own space. A target saved before spaces stays, so editing the key does not lose it.
  const savedTargetId = existing?.action.type === "nav.goToBoard" ? existing.action.boardId : undefined;
  const targetBoards = visibleBoards(boards).filter((board) => board.kind === boardKind || board.id === savedTargetId);
  // A folder key keeps its action: changing it would delete the folder, which only Delete does (and asks first).
  // A folder is created with a new key, so another key cannot become one.
  const isFolderKey = existing?.action.type === "nav.openFolder";
  const offersFolder = canAddFolder && !existing;
  const showsFixedAction = (fixedAction || isFolderKey) && draft.actionType !== "";
  // A key saved before its action's category left this kind (captions on a deck board) keeps showing its
  // action, alone, so editing the key never loses it; the rest of the list is what the kind offers.
  const offeredCategories = allowedActionCategories(boardKind);
  const keptType = existing && !offeredCategories.includes(ACTION_REGISTRY[existing.action.type].category) ? existing.action.type : undefined;
  const number = slot + 1;

  return (
    <form ref={form} className={variant === "inspector" ? "key-editor key-editor-inspector" : "key-editor"} onSubmit={submit} noValidate aria-describedby={error ? ids.error : undefined}>
      {heading}

      {showsFixedAction && draft.actionType ? (
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
            {keptType && <option value={keptType}>{t(ACTION_REGISTRY[keptType].labelKey as MessageKey)}</option>}
            {offeredCategories.map((category) => (
              <optgroup key={category} label={t(`category.${category}`)}>
                {ACTION_TYPES.filter(
                  (type) => ACTION_REGISTRY[type].userSelectable && ACTION_REGISTRY[type].category === category && (type !== "nav.openFolder" || offersFolder),
                ).map((type) => (
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
          listApplications={listApplications}
          invalidField={error?.field}
        />
      )}

      {draft.actionType === "system.multiAction" && (
        <MultiActionSteps
          steps={draft.steps ?? []}
          onChange={(steps) => update({ steps })}
          boardKind={boardKind}
          boards={targetBoards}
          obs={obs}
          listApplications={listApplications}
          invalidField={error?.field}
        />
      )}

      {draft.actionType && ACTION_REGISTRY[draft.actionType].canSpan && (
        <div className="key-editor-span">
          <div className="field">
            <label htmlFor={ids.spanRows}>{t("editor.spanRows")}</label>
            <select id={ids.spanRows} value={draft.spanRows} aria-describedby={ids.spanHint} onChange={(event) => update({ spanRows: Number(event.target.value) })}>
              {range(MAX_KEY_SPAN_ROWS).map((rows) => (
                <option key={rows} value={rows}>
                  {t(`editor.rows.${rows}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.spanColumns}>{t("editor.spanColumns")}</label>
            <select id={ids.spanColumns} value={draft.spanColumns} aria-describedby={ids.spanHint} onChange={(event) => update({ spanColumns: Number(event.target.value) })}>
              {range(MAX_KEY_SPAN_COLUMNS).map((columns) => (
                <option key={columns} value={columns}>
                  {t(`editor.columns.${columns}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <p id={ids.spanHint} className="field-hint">
            {t("editor.spanHint")}
          </p>
        </div>
      )}

      <div className="field key-editor-name">
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

      {draft.actionType && hasOnState(draft.actionType) ? (
        <>
          <ColorPicker
            legend={t("editor.colorOff")}
            name={`color-${ids.action}`}
            hexId={ids.hex}
            value={draft.color}
            onChange={(color) => update({ color })}
          />
          <ColorPicker
            legend={t("editor.colorOn")}
            name={`active-color-${ids.action}`}
            hexId={ids.activeHex}
            value={draft.activeColor}
            onChange={(activeColor) => update({ activeColor })}
          />
        </>
      ) : (
        <ColorPicker legend={t("editor.color")} name={`color-${ids.action}`} hexId={ids.hex} value={draft.color} onChange={(color) => update({ color })} />
      )}

      <p id={ids.error} className="field-error" role="alert">
        {error ? t(error.message.key, error.message.params) : ""}
      </p>

      <div className="key-editor-actions">
        <button type="submit" className={variant === "inspector" ? "button button-primary button-block" : "button button-small button-primary"} disabled={isBusy}>
          {t("editor.save")}
        </button>
        <button type="button" className="button button-small button-quiet" onClick={test}>
          {t("editor.test")}
        </button>
        {onCancel && (
          <button type="button" className="button button-small" onClick={onCancel}>
            {cancelLabel ?? t("editor.cancel")}
          </button>
        )}
      </div>

      {existing && onMove && (
        <div className="field field-inline key-editor-move">
          <label htmlFor={ids.move}>{t("editor.moveTo")}</label>
          <input
            id={ids.move}
            type="number"
            inputMode="numeric"
            min={1}
            max={slotCount}
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

/** 1, 2, … `count`. */
function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

interface PickerChoiceProps {
  name: string;
  checked: boolean;
  /** Accessible name of the choice. */
  label: string;
  onSelect: () => void;
  children: ReactNode;
}

interface ColorPickerProps {
  legend: string;
  /** Name of the radio group. */
  name: string;
  hexId: string;
  /** `#rrggbb` as typed, or empty for none. */
  value: string;
  onChange: (value: string) => void;
}

/** A key colour: none, a preset swatch or a typed hex value. */
function ColorPicker({ legend, name, hexId, value, onChange }: ColorPickerProps) {
  const t = useT();
  const hexInvalid = value !== "" && !isHexColor(value);
  return (
    <fieldset className="picker">
      <legend>{legend}</legend>
      <div className="color-picker">
        <PickerChoice name={name} checked={value === ""} label={t("editor.colorNone")} onSelect={() => onChange("")}>
          <span className="swatch swatch-none" aria-hidden="true" />
        </PickerChoice>
        {KEY_COLOR_PRESETS.map((preset) => (
          <PickerChoice key={preset.name} name={name} checked={value.toLowerCase() === preset.value} label={t(`color.${preset.name}`)} onSelect={() => onChange(preset.value)}>
            <span className="swatch" style={{ background: preset.value }} aria-hidden="true" />
          </PickerChoice>
        ))}
      </div>
      <div className="field field-inline">
        <label htmlFor={hexId}>{t("editor.colorHex")}</label>
        <input
          id={hexId}
          className="hex-input"
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          placeholder="#1a2b3c"
          value={value}
          aria-invalid={hexInvalid || undefined}
          onChange={(event) => onChange(event.target.value.trim())}
        />
      </div>
    </fieldset>
  );
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
