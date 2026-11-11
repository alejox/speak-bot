import { ACTION_REGISTRY, applicationNameOf, type Action, type ActionType, type Board, type Key, type KeyRef, type ObsConnectionStatus, type ObsState, type UiLanguage } from "@speed-deck/core";
import type { Translate } from "../i18n/I18nProvider";
import { LANGUAGE_NAMES, type Message, type MessageKey } from "../i18n/messages";

/** OBS as the client last heard from the desktop. */
export interface ObsLive {
  /** `obs.enabled` in the desktop settings. */
  enabled: boolean;
  status: ObsConnectionStatus;
  state: ObsState;
}

/** What a key needs to know to show its state. */
export interface KeyContext {
  /** Speaking and running keys on the desktop (Computer mode). */
  isRemote: boolean;
  /** Null in phone-only mode or before the desktop answered. */
  obs: ObsLive | null;
  captionsVisible: boolean | null;
  voiceLanguage: UiLanguage;
  boards: readonly Board[];
  /** Keys whose multi-action runs on the desktop right now, as `runningKeyId` gives them. */
  runningKeys?: ReadonlySet<string>;
}

/** How a running multi-action names its key: the desktop's run id for it. */
export function runningKeyId(key: KeyRef): string {
  return `${key.boardId}:${key.slot}`;
}

/** What a toggle that is on is doing; each one has its own cue on the key. */
export type KeyLiveState = "live" | "recording" | "muted" | "on" | "scene" | "running";

/** The three looks of a key: something to say, something to do, somewhere to go. */
export type KeyRole = "phrase" | "command" | "navigation";

export interface KeyPresentation {
  /** Toggle state (muted, live, recording, current scene, captions visible); undefined for plain keys. */
  pressed?: boolean;
  /** Which "on" this is; undefined while the toggle is off and for plain keys. */
  state?: KeyLiveState;
  /** The icon of the current state when it differs from the action's (muted, captions hidden). */
  iconId?: string;
  /** Why the key cannot run right now; undefined when it can. */
  disabledReason?: MessageKey;
  /** A short line under the label, e.g. the current voice language. */
  detail?: Message;
}

/** The live state of a key: pressed, disabled (and why) and any extra detail. `key` is where it sits, for a running multi-action. */
export function presentKey(action: Action, context: KeyContext, key?: KeyRef): KeyPresentation {
  const definition = ACTION_REGISTRY[action.type];
  if (definition.requiresDesktop && !context.isRemote) return { disabledReason: "key.needsComputer" };
  if (definition.requiresObs) {
    const { obs } = context;
    if (obs && !obs.enabled) return { disabledReason: "key.obsDisabled" };
    if (obs?.status !== "connected") return { disabledReason: "key.obsDisconnected" };
  }
  const state = context.obs?.state;
  switch (action.type) {
    case "voice.toggleLanguage":
      return { detail: { key: "key.currentVoice", params: { language: LANGUAGE_NAMES[context.voiceLanguage] } } };
    case "captions.toggle":
      if (context.captionsVisible === null) return {};
      return context.captionsVisible ? { pressed: true, state: "on" } : { pressed: false, iconId: "captions-off" };
    case "nav.goToBoard":
      return context.boards.some((board) => board.id === action.boardId) ? {} : { disabledReason: "key.boardMissing" };
    case "nav.openFolder":
      return context.boards.some((board) => board.id === action.folderId) ? {} : { disabledReason: "key.folderMissing" };
    case "system.multiAction":
      return key && context.runningKeys?.has(runningKeyId(key)) ? { state: "running" } : {};
    case "obs.toggleMute":
      return state?.mutedInputs.includes(action.inputName) ? { pressed: true, state: "muted", iconId: "mic-off" } : { pressed: false };
    case "obs.toggleStream":
      return toggle(state?.streaming, "live");
    case "obs.toggleRecord":
      return toggle(state?.recording, "recording");
    case "obs.switchScene":
      return toggle(state?.currentScene === action.sceneName, "scene");
    case "obs.toggleSourceVisibility": {
      // An older desktop does not report hidden sources: keep the plain key.
      if (!state?.hiddenSources) return {};
      const hidden = state.hiddenSources.some((source) => source.sceneName === action.sceneName && source.sourceName === action.sourceName);
      return hidden ? { pressed: false, iconId: "eye-off" } : { pressed: true, state: "on" };
    }
    default:
      return {};
  }
}

/** Actions whose key shows an on state (see `presentKey`); only these keys offer a colour for when they are on. */
const ON_STATE_ACTION_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  "captions.toggle",
  "obs.toggleMute",
  "obs.toggleStream",
  "obs.toggleRecord",
  "obs.switchScene",
  "obs.toggleSourceVisibility",
]);

export function hasOnState(actionType: ActionType): boolean {
  return ON_STATE_ACTION_TYPES.has(actionType);
}

/** The colour a key is filled with: its on colour while its toggle is on, otherwise its own. */
export function keyFillColor(key: Key, pressed: boolean | undefined): string | undefined {
  return pressed && key.activeColor ? key.activeColor : key.color;
}

function toggle(isOn: boolean | undefined, state: KeyLiveState): KeyPresentation {
  return isOn ? { pressed: true, state } : { pressed: false };
}

/** The look of a key, from what its action is for. */
export function keyRole(action: Action): KeyRole {
  if (action.type === "voice.speak") return "phrase";
  return ACTION_REGISTRY[action.type].category === "navigation" ? "navigation" : "command";
}

/** The text shown on a key: its label, otherwise what it does (the text it says, the scene it opens…). */
export function keyLabel(key: Key, boards: readonly Board[], t: Translate): string {
  if (key.label) return key.label;
  const { action } = key;
  switch (action.type) {
    case "voice.speak":
      return action.text;
    case "obs.switchScene":
      return action.sceneName;
    case "obs.toggleMute":
    case "obs.inputVolume":
      return action.inputName;
    case "obs.toggleSourceVisibility":
      return action.sourceName;
    case "system.openApp":
      return applicationNameOf(action.appId);
    case "nav.goToPage":
      return t("key.pageLabel", { page: action.page });
    case "nav.goToBoard":
      return boards.find((board) => board.id === action.boardId)?.name ?? t(ACTION_REGISTRY[action.type].keyLabelKey as MessageKey);
    case "nav.openFolder":
      return boards.find((board) => board.id === action.folderId)?.name ?? t(ACTION_REGISTRY[action.type].keyLabelKey as MessageKey);
    default:
      // The short key name, not the action's full name from the picker ("Stream", not "Start or stop stream").
      return t(ACTION_REGISTRY[action.type].keyLabelKey as MessageKey);
  }
}

/** How long a key's label is, so the styles can step its font down before clamping it. */
export type KeyLabelLength = "long" | "longer";

/** Labels up to this many characters keep the key's own size. */
const LONG_LABEL_FROM = 15;
/** Past this many characters the label gets the smallest size. */
const LONGER_LABEL_FROM = 29;

/** Undefined for a label that fits at the normal size; counts characters, not UTF-16 units. */
export function keyLabelLength(label: string): KeyLabelLength | undefined {
  const length = [...label.trim()].length;
  if (length >= LONGER_LABEL_FROM) return "longer";
  if (length >= LONG_LABEL_FROM) return "long";
  return undefined;
}

/**
 * The icon a key draws: the one the person chose, otherwise the one of its current state or action.
 * A phrase is text first, so it draws an icon only when the person chose one.
 */
export function keyShownIconId(key: Key, stateIconId?: string): string | undefined {
  if (key.icon) return key.icon;
  return key.action.type === "voice.speak" ? undefined : (stateIconId ?? ACTION_REGISTRY[key.action.type].defaultIcon);
}

/** How a key is drawn whatever its live state: its shape, its icon and which way it points. */
export interface KeyLook {
  role: KeyRole;
  iconId: string | undefined;
  danger: boolean;
  backwards: boolean;
}

export function keyLook(key: Key, stateIconId?: string): KeyLook {
  const { type } = key.action;
  return { role: keyRole(key.action), iconId: keyShownIconId(key, stateIconId), danger: type === "voice.stop", backwards: type === "nav.prevPage" || type === "nav.folderBack" };
}

/** The words shown on a toggle that is on; the current scene is marked without words. */
export const KEY_STATE_LABELS: Readonly<Partial<Record<KeyLiveState, MessageKey>>> = {
  live: "key.state.live",
  recording: "key.state.recording",
  muted: "key.state.muted",
  on: "key.state.on",
  running: "key.state.running",
};
