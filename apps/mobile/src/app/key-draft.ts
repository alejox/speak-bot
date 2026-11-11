import {
  ACTION_REGISTRY,
  InvalidBoardError,
  isHexColor,
  MAX_MULTI_ACTION_STEPS,
  MAX_STEP_DELAY_MS,
  MIN_MULTI_ACTION_STEPS,
  parseAction,
  type Action,
  type ActionType,
  type Key,
} from "@speed-deck/core";
import type { KeyInput } from "../adapters/board-stores";
import { hasOnState } from "./key-presentation";
import type { Message, MessageKey } from "../i18n/messages";

/** What the key editor holds while the user types: every field as text. */
export interface KeyDraft {
  label: string;
  /** Empty for the action's default icon. */
  icon: string;
  /** Empty for no color; otherwise what the user typed or picked. */
  color: string;
  /** The color while the key's toggle is on, like `color`; only kept for actions with an on state. */
  activeColor: string;
  /** Empty until an action is chosen. */
  actionType: ActionType | "";
  /** Parameter values by name, as typed. */
  params: Record<string, string>;
  /** Rows and columns the key covers; only saved for actions that can span (see `ActionDefinition.canSpan`). */
  spanRows: number;
  spanColumns: number;
  /** The steps of a multi-action, in order; only saved for one. */
  steps?: StepDraft[];
}

/** One step of a multi-action as the user types it. */
export interface StepDraft {
  /** Empty until an action is chosen. */
  actionType: ActionType | "";
  /** Parameter values by name, as typed. */
  params: Record<string, string>;
  /** Seconds to wait before the step, as typed; empty means none. */
  delay: string;
}

/** The folder id of a folder key that is not saved yet: saving it creates its folder (see `isNewFolderKey`). */
export const NEW_FOLDER_ID = "";

/** Whether `key` is a folder key whose folder is created when it is saved. */
export function isNewFolderKey(key: KeyInput): boolean {
  return key.action.type === "nav.openFolder" && key.action.folderId === NEW_FOLDER_ID;
}

/**
 * Whether picking `type` for a new key needs a form before saving: its parameters, or the steps of a
 * multi-action. A folder needs none: its folder is created with the key.
 */
export function needsDetails(type: ActionType): boolean {
  if (type === "nav.openFolder") return false;
  return type === "system.multiAction" || ACTION_REGISTRY[type].params.length > 0;
}

/** A step with nothing chosen yet. */
export function emptyStep(): StepDraft {
  return { actionType: "", params: {}, delay: "" };
}

/** The parameter values of `action` as text, by name. */
function paramsOf(action: Action): Record<string, string> {
  const params: Record<string, string> = {};
  for (const param of ACTION_REGISTRY[action.type].params) params[param.name] = String((action as Record<string, unknown>)[param.name] ?? "");
  return params;
}

/** Preset key colors, light and dark, each with an i18n name (`color.<name>`). */
export const KEY_COLOR_PRESETS = [
  { name: "red", value: "#dc2626" },
  { name: "orange", value: "#ea580c" },
  { name: "yellow", value: "#facc15" },
  { name: "green", value: "#16a34a" },
  { name: "teal", value: "#0d9488" },
  { name: "blue", value: "#2563eb" },
  { name: "purple", value: "#7c3aed" },
  { name: "pink", value: "#db2777" },
  { name: "gray", value: "#4b5563" },
] as const;

/** The draft of an existing key, or of an empty slot, optionally with an action type chosen in the library. */
export function draftOf(key: Key | undefined, actionType?: ActionType): KeyDraft {
  const action = key?.action;
  const keepsAction = action !== undefined && (!actionType || actionType === action.type);
  const params = keepsAction ? paramsOf(action) : {};
  // A new multi-action starts with the two steps it needs at least.
  const steps =
    keepsAction && action.type === "system.multiAction"
      ? action.steps.map((step) => ({ actionType: step.action.type, params: paramsOf(step.action), delay: step.delayMs === 0 ? "" : String(step.delayMs / 1000) }))
      : Array.from({ length: MIN_MULTI_ACTION_STEPS }, emptyStep);
  return {
    label: key?.label ?? "",
    icon: key?.icon ?? "",
    color: key?.color ?? "",
    activeColor: key?.activeColor ?? "",
    actionType: actionType ?? action?.type ?? "",
    params,
    spanRows: key?.span?.rows ?? 1,
    spanColumns: key?.span?.columns ?? 1,
    steps,
  };
}

export type DraftResult = { ok: true; key: KeyInput } | { ok: false; error: Message; field: string };

type DraftProblem = { ok: false; error: Message; field: string };

/** The field id of a step's parameter (or its "action" or "delay"), as the editor marks it. */
export function stepField(index: number, name: string): string {
  return `step-${index}-${name}`;
}

/** The action a draft describes, or the first problem with it as a localized message. */
export function draftAction(draft: KeyDraft, t: (key: MessageKey) => string): { ok: true; action: Action } | DraftProblem {
  if (!draft.actionType) return { ok: false, error: { key: "editor.actionRequired" }, field: "action" };
  // A new folder key has no folder yet: saving it creates one.
  if (draft.actionType === "nav.openFolder" && (draft.params.folderId ?? "") === "") return { ok: true, action: { type: "nav.openFolder", folderId: NEW_FOLDER_ID } };
  const raw = draft.actionType === "system.multiAction" ? rawMultiAction(draft.steps ?? [], t) : rawAction(draft.actionType, draft.params, t, (name) => name);
  if (!raw.ok) return raw;
  try {
    return { ok: true, action: parseAction(raw.value) };
  } catch (error) {
    if (error instanceof InvalidBoardError) return { ok: false, error: { key: "errorCode.invalidBoard" }, field: "action" };
    throw error;
  }
}

/** The unchecked action of one type from its typed parameters; `fieldOf` names the field of a parameter. */
function rawAction(actionType: ActionType, values: Record<string, string>, t: (key: MessageKey) => string, fieldOf: (name: string) => string): { ok: true; value: Record<string, unknown> } | DraftProblem {
  const raw: Record<string, unknown> = { type: actionType };
  for (const param of ACTION_REGISTRY[actionType].params) {
    const value = values[param.name] ?? "";
    const field = t(param.labelKey as MessageKey);
    if (value.trim() === "") return { ok: false, error: { key: "editor.paramRequired", params: { field } }, field: fieldOf(param.name) };
    if (param.kind === "number") {
      const number = Number(value);
      const min = param.min ?? 0;
      const max = param.max ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(number) || number < min || number > max) {
        return { ok: false, error: { key: "editor.numberRange", params: { field, min, max } }, field: fieldOf(param.name) };
      }
      raw[param.name] = number;
    } else raw[param.name] = value;
  }
  return { ok: true, value: raw };
}

/** The unchecked multi-action of typed steps; waits are typed in seconds and stored in milliseconds. */
function rawMultiAction(steps: readonly StepDraft[], t: (key: MessageKey) => string): { ok: true; value: Record<string, unknown> } | DraftProblem {
  if (steps.length < MIN_MULTI_ACTION_STEPS || steps.length > MAX_MULTI_ACTION_STEPS) {
    return { ok: false, error: { key: "editor.stepsCount", params: { min: MIN_MULTI_ACTION_STEPS, max: MAX_MULTI_ACTION_STEPS } }, field: "steps" };
  }
  const parsed: Record<string, unknown>[] = [];
  for (const [index, step] of steps.entries()) {
    const number = index + 1;
    if (!step.actionType) return { ok: false, error: { key: "editor.stepActionRequired", params: { number } }, field: stepField(index, "action") };
    const action = rawAction(step.actionType, step.params, t, (name) => stepField(index, name));
    if (!action.ok) return action;
    const seconds = step.delay.trim() === "" ? 0 : Number(step.delay.replace(",", "."));
    const max = MAX_STEP_DELAY_MS / 1000;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > max) {
      return { ok: false, error: { key: "editor.numberRange", params: { field: t("editor.stepDelay"), min: 0, max } }, field: stepField(index, "delay") };
    }
    parsed.push({ action: action.value, delayMs: Math.round(seconds * 1000) });
  }
  return { ok: true, value: { type: "system.multiAction", steps: parsed } };
}

/** The key to save from a draft, or the first problem with it. */
export function draftToKey(slot: number, draft: KeyDraft, t: (key: MessageKey) => string): DraftResult {
  const color = draft.color.trim();
  if (color !== "" && !isHexColor(color)) return { ok: false, error: { key: "editor.colorInvalid" }, field: "color" };
  // Only a key with an on state has a colour for it; any other key is saved without one, which drops a stored one.
  const withOnState = draft.actionType !== "" && hasOnState(draft.actionType);
  const activeColor = withOnState ? draft.activeColor.trim() : "";
  if (activeColor !== "" && !isHexColor(activeColor)) return { ok: false, error: { key: "editor.colorInvalid" }, field: "activeColor" };
  const action = draftAction(draft, t);
  if (!action.ok) return action;
  // A folder is named after its key, so a new one without a label is called "Folder".
  const isNewFolder = action.action.type === "nav.openFolder" && action.action.folderId === NEW_FOLDER_ID;
  const label = draft.label.trim() || (isNewFolder ? t("action.nav.openFolder.key") : "");
  const base: KeyInput = { slot, label, icon: draft.icon, color: color.toLowerCase(), action: action.action };
  const key = ACTION_REGISTRY[action.action.type].canSpan ? { ...base, span: { rows: draft.spanRows, columns: draft.spanColumns } } : base;
  return { ok: true, key: withOnState ? { ...key, activeColor: activeColor.toLowerCase() } : key };
}

/** The key for an action without parameters: nothing to fill in, it shows the action's own name and icon. */
export function actionOnlyKey(slot: number, actionType: ActionType, t: (key: MessageKey) => string): KeyInput | null {
  const result = draftToKey(slot, draftOf(undefined, actionType), t);
  return result.ok ? result.key : null;
}
