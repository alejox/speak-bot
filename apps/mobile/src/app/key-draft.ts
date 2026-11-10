import {
  ACTION_REGISTRY,
  InvalidBoardError,
  isHexColor,
  parseAction,
  type Action,
  type ActionType,
  type Key,
} from "@speed-deck/core";
import type { KeyInput } from "../adapters/board-stores";
import type { Message, MessageKey } from "../i18n/messages";

/** What the key editor holds while the user types: every field as text. */
export interface KeyDraft {
  label: string;
  /** Empty for the action's default icon. */
  icon: string;
  /** Empty for no color; otherwise what the user typed or picked. */
  color: string;
  /** Empty until an action is chosen. */
  actionType: ActionType | "";
  /** Parameter values by name, as typed. */
  params: Record<string, string>;
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
  const params: Record<string, string> = {};
  if (action && (!actionType || actionType === action.type)) {
    for (const param of ACTION_REGISTRY[action.type].params) params[param.name] = String((action as Record<string, unknown>)[param.name] ?? "");
  }
  return {
    label: key?.label ?? "",
    icon: key?.icon ?? "",
    color: key?.color ?? "",
    actionType: actionType ?? action?.type ?? "",
    params,
  };
}

export type DraftResult = { ok: true; key: KeyInput } | { ok: false; error: Message; field: string };

/** The action a draft describes, or the first problem with it as a localized message. */
export function draftAction(draft: KeyDraft, t: (key: MessageKey) => string): { ok: true; action: Action } | { ok: false; error: Message; field: string } {
  if (!draft.actionType) return { ok: false, error: { key: "editor.actionRequired" }, field: "action" };
  const definition = ACTION_REGISTRY[draft.actionType];
  const raw: Record<string, unknown> = { type: draft.actionType };
  for (const param of definition.params) {
    const value = draft.params[param.name] ?? "";
    const field = t(param.labelKey as MessageKey);
    if (value.trim() === "") return { ok: false, error: { key: "editor.paramRequired", params: { field } }, field: param.name };
    if (param.kind === "number") {
      const number = Number(value);
      const min = param.min ?? 0;
      const max = param.max ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(number) || number < min || number > max) {
        return { ok: false, error: { key: "editor.numberRange", params: { field, min, max } }, field: param.name };
      }
      raw[param.name] = number;
    } else raw[param.name] = value;
  }
  try {
    return { ok: true, action: parseAction(raw) };
  } catch (error) {
    if (error instanceof InvalidBoardError) return { ok: false, error: { key: "errorCode.invalidBoard" }, field: "action" };
    throw error;
  }
}

/** The key to save from a draft, or the first problem with it. */
export function draftToKey(slot: number, draft: KeyDraft, t: (key: MessageKey) => string): DraftResult {
  const color = draft.color.trim();
  if (color !== "" && !isHexColor(color)) return { ok: false, error: { key: "editor.colorInvalid" }, field: "color" };
  const action = draftAction(draft, t);
  if (!action.ok) return action;
  return { ok: true, key: { slot, label: draft.label.trim(), icon: draft.icon, color: color.toLowerCase(), action: action.action } };
}
