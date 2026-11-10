import { ACTION_REGISTRY, type Action, type Board, type Key, type ObsConnectionStatus, type ObsState, type UiLanguage } from "@speed-deck/core";
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
}

export interface KeyPresentation {
  /** Toggle state (muted, live, recording, current scene, captions hidden); undefined for plain keys. */
  pressed?: boolean;
  /** Why the key cannot run right now; undefined when it can. */
  disabledReason?: MessageKey;
  /** A short line under the label, e.g. the current voice language. */
  detail?: Message;
}

/** The live state of a key: pressed, disabled (and why) and any extra detail. */
export function presentKey(action: Action, context: KeyContext): KeyPresentation {
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
      return context.captionsVisible === null ? {} : { pressed: !context.captionsVisible };
    case "nav.goToBoard":
      return context.boards.some((board) => board.id === action.boardId) ? {} : { disabledReason: "key.boardMissing" };
    case "obs.toggleMute":
      return { pressed: state?.mutedInputs.includes(action.inputName) ?? false };
    case "obs.toggleStream":
      return { pressed: state?.streaming ?? false };
    case "obs.toggleRecord":
      return { pressed: state?.recording ?? false };
    case "obs.switchScene":
      return { pressed: state?.currentScene === action.sceneName };
    default:
      return {};
  }
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
      return action.inputName;
    case "obs.toggleSourceVisibility":
      return action.sourceName;
    case "nav.goToPage":
      return t("key.pageLabel", { page: action.page });
    case "nav.goToBoard":
      return boards.find((board) => board.id === action.boardId)?.name ?? t(ACTION_REGISTRY[action.type].labelKey as MessageKey);
    default:
      return t(ACTION_REGISTRY[action.type].labelKey as MessageKey);
  }
}

/** The icon id a key shows: its own, otherwise its action's. */
export function keyIconId(key: Key): string {
  return key.icon ?? ACTION_REGISTRY[key.action.type].defaultIcon;
}
