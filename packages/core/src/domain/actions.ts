/**
 * What a deck key does when pressed. Actions are plain data so they can be stored, sent over the
 * wire and validated; `ACTION_REGISTRY` describes every action type for editors and executors.
 */

/** Longest text a `voice.speak` action may hold, matching the longest text the desktop speaks at once. */
export const MAX_ACTION_TEXT_LENGTH = 1000;
/** Longest OBS scene, input or source name accepted in an action. */
export const MAX_OBS_NAME_LENGTH = 200;
/** Longest board id accepted in an action. */
export const MAX_BOARD_ID_LENGTH = 100;
/** Highest page number (1-based) a `nav.goToPage` action may target. */
export const MAX_PAGE_NUMBER = 100;

/** Longest application id accepted in a `system.openApp` action (a path on the computer). */
export const MAX_APPLICATION_ID_LENGTH = 1024;

export type Action =
  | { readonly type: "voice.speak"; readonly text: string }
  | { readonly type: "voice.stop" }
  | { readonly type: "voice.repeat" }
  | { readonly type: "voice.toggleLanguage" }
  | { readonly type: "captions.clear" }
  | { readonly type: "captions.toggle" }
  | { readonly type: "nav.nextPage" }
  | { readonly type: "nav.prevPage" }
  /** `page` is 1-based, as shown to the user. */
  | { readonly type: "nav.goToPage"; readonly page: number }
  | { readonly type: "nav.goToBoard"; readonly boardId: string }
  | { readonly type: "obs.switchScene"; readonly sceneName: string }
  | { readonly type: "obs.toggleMute"; readonly inputName: string }
  | { readonly type: "obs.toggleStream" }
  | { readonly type: "obs.toggleRecord" }
  | { readonly type: "obs.toggleSourceVisibility"; readonly sceneName: string; readonly sourceName: string }
  /** `appId` is one of the ids the desktop lists (GET /api/applications); the desktop opens nothing else. */
  | { readonly type: "system.openApp"; readonly appId: string };

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

export type ActionCategory = "voice" | "captions" | "navigation" | "obs" | "system";
export const ACTION_CATEGORIES: readonly ActionCategory[] = ["voice", "captions", "navigation", "obs", "system"];

/**
 * How an editor should ask for a parameter: free text, a number, or a pick list of OBS scenes, inputs,
 * sources, boards or the computer's applications.
 */
export type ActionParamKind = "text" | "number" | "scene" | "input" | "source" | "board" | "application";

export interface ActionParamDefinition {
  readonly name: string;
  readonly kind: ActionParamKind;
  /** Longest string value (string kinds). */
  readonly maxLength?: number;
  /** Inclusive integer range (number kind). */
  readonly min?: number;
  readonly max?: number;
  /** i18n key of the field label. */
  readonly labelKey: string;
}

export interface ActionDefinition {
  readonly type: ActionType;
  readonly category: ActionCategory;
  readonly params: readonly ActionParamDefinition[];
  /** "client": every client handles it on its own (navigation). "server": the desktop runs it. */
  readonly runsOn: "client" | "server";
  /** Needs the desktop companion; disabled in phone-only mode. */
  readonly requiresDesktop: boolean;
  /** Needs a connected OBS. */
  readonly requiresObs: boolean;
  /** Icon id used when a key does not choose one (see `KEY_ICON_IDS`). */
  readonly defaultIcon: string;
  /** i18n key of the action name, as the action picker and editor show it. */
  readonly labelKey: string;
  /** i18n key of the short name a key shows when it has no label of its own; it must fit on a key. */
  readonly keyLabelKey: string;
  /** i18n key of the one-line description shown in the action library. */
  readonly descriptionKey: string;
}

const textParam = (name: string, kind: ActionParamKind, maxLength: number): ActionParamDefinition => ({
  name,
  kind,
  maxLength,
  labelKey: `actionParam.${name}`,
});

function define(
  type: ActionType,
  category: ActionCategory,
  defaultIcon: string,
  options: { params?: ActionParamDefinition[]; runsOn?: "client" | "server"; requiresDesktop?: boolean; requiresObs?: boolean } = {},
): ActionDefinition {
  const requiresObs = options.requiresObs ?? false;
  return {
    type,
    category,
    params: options.params ?? [],
    runsOn: options.runsOn ?? "server",
    requiresDesktop: options.requiresDesktop ?? requiresObs,
    requiresObs,
    defaultIcon,
    labelKey: `action.${type}`,
    keyLabelKey: `action.${type}.key`,
    descriptionKey: `action.${type}.description`,
  };
}

const sceneParam = textParam("sceneName", "scene", MAX_OBS_NAME_LENGTH);

/** Metadata for every action type, in library order. */
export const ACTION_REGISTRY: { readonly [T in ActionType]: ActionDefinition } = {
  "voice.speak": define("voice.speak", "voice", "message", { params: [textParam("text", "text", MAX_ACTION_TEXT_LENGTH)] }),
  "voice.stop": define("voice.stop", "voice", "stop"),
  "voice.repeat": define("voice.repeat", "voice", "repeat"),
  "voice.toggleLanguage": define("voice.toggleLanguage", "voice", "language"),
  "captions.clear": define("captions.clear", "captions", "eraser", { requiresDesktop: true }),
  "captions.toggle": define("captions.toggle", "captions", "captions", { requiresDesktop: true }),
  "nav.nextPage": define("nav.nextPage", "navigation", "arrow-right", { runsOn: "client" }),
  "nav.prevPage": define("nav.prevPage", "navigation", "arrow-left", { runsOn: "client" }),
  "nav.goToPage": define("nav.goToPage", "navigation", "page", {
    runsOn: "client",
    params: [{ name: "page", kind: "number", min: 1, max: MAX_PAGE_NUMBER, labelKey: "actionParam.page" }],
  }),
  "nav.goToBoard": define("nav.goToBoard", "navigation", "board", {
    runsOn: "client",
    params: [textParam("boardId", "board", MAX_BOARD_ID_LENGTH)],
  }),
  "obs.switchScene": define("obs.switchScene", "obs", "scene", { requiresObs: true, params: [sceneParam] }),
  "obs.toggleMute": define("obs.toggleMute", "obs", "mic", {
    requiresObs: true,
    params: [textParam("inputName", "input", MAX_OBS_NAME_LENGTH)],
  }),
  "obs.toggleStream": define("obs.toggleStream", "obs", "broadcast", { requiresObs: true }),
  "obs.toggleRecord": define("obs.toggleRecord", "obs", "record", { requiresObs: true }),
  "obs.toggleSourceVisibility": define("obs.toggleSourceVisibility", "obs", "eye", {
    requiresObs: true,
    params: [sceneParam, textParam("sourceName", "source", MAX_OBS_NAME_LENGTH)],
  }),
  "system.openApp": define("system.openApp", "system", "star", {
    requiresDesktop: true,
    params: [textParam("appId", "application", MAX_APPLICATION_ID_LENGTH)],
  }),
};

export const ACTION_TYPES = Object.keys(ACTION_REGISTRY) as ActionType[];

export function isActionType(value: unknown): value is ActionType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, value);
}

export function actionDefinition(type: ActionType): ActionDefinition {
  return ACTION_REGISTRY[type];
}

/** A board, key or action failed validation. */
export class InvalidBoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBoardError";
  }
}

/**
 * Validates untrusted input (request bodies, stored data) as an action. Unknown
 * properties are dropped. Free text is trimmed. Throws `InvalidBoardError` with an English message on any problem.
 */
export function parseAction(value: unknown): Action {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidBoardError("action must be an object.");
  const input = value as Record<string, unknown>;
  if (!isActionType(input.type)) throw new InvalidBoardError("action.type is not a known action.");
  const definition = ACTION_REGISTRY[input.type];
  const action: Record<string, unknown> = { type: definition.type };
  for (const param of definition.params) action[param.name] = parseParam(param, input[param.name]);
  return action as unknown as Action;
}

function parseParam(param: ActionParamDefinition, value: unknown): string | number {
  if (param.kind === "number") {
    const min = param.min ?? 0;
    const max = param.max ?? Number.MAX_SAFE_INTEGER;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new InvalidBoardError(`action.${param.name} must be an integer from ${min} to ${max}.`);
    }
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") throw new InvalidBoardError(`action.${param.name} must be a non-empty string.`);
  // Free text is trimmed; OBS names and ids are kept verbatim because they must match exactly.
  const result = param.kind === "text" ? value.trim() : value;
  if (param.maxLength !== undefined && result.length > param.maxLength) {
    throw new InvalidBoardError(`action.${param.name} must be at most ${param.maxLength} characters.`);
  }
  return result;
}
