/**
 * Wire protocol shared by the desktop server and its clients (mobile app, OBS overlay).
 * Pure types and tiny guards only: no runtime dependencies.
 */
import type { Action } from "./domain/actions";
import type { Board, Key } from "./domain/board";
import type { Voice } from "./ports/speech-synthesizer";

/** Longest text the desktop server accepts for a single utterance. */
export const MAX_SPEAK_TEXT_LENGTH = 1000;

/** Identifies a speak-bot desktop server in the health response. */
export const DESKTOP_SERVER_NAME = "speak-bot-desktop";

/** Languages the user interface is available in. */
export const UI_LANGUAGES = ["es", "en"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = "es";

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === "string" && (UI_LANGUAGES as readonly string[]).includes(value);
}

// ---- Server → client WebSocket events (path `/ws`) ----

export interface CaptionEvent {
  readonly type: "caption";
  readonly text: string;
  /** Epoch milliseconds. */
  readonly at: number;
}

export interface SpeakingEvent {
  readonly type: "speaking";
  readonly state: "start" | "end";
  readonly at: number;
}

/** Boards or keys changed on the desktop (from any client); reload GET /api/boards. */
export interface BoardsChangedEvent {
  readonly type: "boards-changed";
  readonly at: number;
}

/** Why the desktop could not speak, so clients can show a message in their own language. */
export type SpeakErrorCode = "engine-unavailable" | "speech-failed";

/** The desktop could not speak, e.g. because the TTS engine is not installed. */
export interface SpeakErrorEvent {
  readonly type: "speak-error";
  /** Technical detail in English (e.g. how to install the engine). */
  readonly message: string;
  readonly code?: SpeakErrorCode;
  readonly at: number;
}

/** Hide the current caption right away (POST /api/captions/clear). */
export interface CaptionClearEvent {
  readonly type: "caption-clear";
  readonly at: number;
}

/** Captions were turned on or off (`captionsVisible` in the desktop settings). */
export interface CaptionsVisibilityEvent {
  readonly type: "captions-visibility";
  readonly visible: boolean;
  readonly at: number;
}

export type ServerEvent =
  | CaptionEvent
  | SpeakingEvent
  | BoardsChangedEvent
  | SpeakErrorEvent
  | CaptionClearEvent
  | CaptionsVisibilityEvent;

export function isServerEvent(value: unknown): value is ServerEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.at !== "number") return false;
  switch (event.type) {
    case "caption":
      return typeof event.text === "string";
    case "speaking":
      return event.state === "start" || event.state === "end";
    case "boards-changed":
      return true;
    case "speak-error":
      return typeof event.message === "string" && (event.code === undefined || typeof event.code === "string");
    case "caption-clear":
      return true;
    case "captions-visibility":
      return typeof event.visible === "boolean";
    default:
      return false;
  }
}

// ---- HTTP JSON API (prefix `/api`) ----

/** What the desktop TTS engine can do on this computer. */
export interface SpeechCapabilities {
  /** Node.js platform name, e.g. "darwin", "win32" or "linux". */
  readonly platform: string;
  /** Engine identifier, e.g. "say", "espeak-ng" or "windows-speech". */
  readonly engine: string;
  /** False means the device selector should be hidden: speech always uses the default output. */
  readonly supportsDeviceSelection: boolean;
}

/** GET /api/health */
export interface HealthResponse {
  readonly ok: true;
  readonly name: typeof DESKTOP_SERVER_NAME;
  readonly capabilities: SpeechCapabilities;
  /** Random per launch; lets the desktop confirm that a port really reaches itself. */
  readonly instanceId: string;
}

/** GET /api/boards → Board[] in display order. */
export type BoardsResponse = Board[];

/** POST /api/boards → 201 Board; PATCH /api/boards/:id → Board. */
export interface BoardNameRequest {
  name: string;
}

/**
 * PUT /api/boards/:id/keys/:slot → Key. A slot that already holds a key → 409 "slot-occupied"
 * unless `replace` is true. DELETE /api/boards/:id/keys/:slot → 204 (an empty slot is fine).
 */
export interface SetKeyRequest {
  label?: string;
  /** One of `KEY_ICON_IDS`; empty for none. */
  icon?: string;
  /** `#rrggbb`; empty for none. */
  color?: string;
  action: Action;
  replace?: boolean;
}

/** POST /api/boards/:id/keys/move → Board. A key already at `to` is swapped to `from`. */
export interface MoveKeyRequest {
  from: number;
  to: number;
}

/** POST /api/boards/restore-default → Board: puts back the built-in communication board. */
export interface RestoreDefaultBoardRequest {
  language: UiLanguage;
}

/**
 * POST /api/actions/execute → 200 `{ ok: true }` (202 for speech, which runs in the background).
 * Navigation actions run in each client → 400 "client-action".
 */
export interface ExecuteActionRequest {
  action: Action;
}

export type { Board, Key };

/** POST /api/speak → 202. */
export interface SpeakRequest {
  text: string;
  voiceId?: string;
  /** Speaking rate multiplier, 1 is normal speed. */
  rate?: number;
}

/** GET /api/voices */
export type VoicesResponse = Voice[];

export interface AudioDevice {
  /** Value passed to the system TTS to select this output device. */
  readonly id: string;
  readonly name: string;
}

/** GET /api/devices */
export type DevicesResponse = AudioDevice[];

/** GET /api/settings; PUT /api/settings with a partial body → full settings. */
export interface DesktopSettings {
  /** Empty string means the system default voice. */
  voiceId: string;
  /** Speaking rate multiplier, 1 is normal speed. */
  rate: number;
  /** Empty string means the system default output device. */
  deviceId: string;
  /** Interface language; also picks the first-run board and, unless `voiceLanguage` is set, the default voice. */
  language: UiLanguage;
  /** False hides the OBS captions until turned back on. */
  captionsVisible: boolean;
  /** Language of the automatic voice; when absent it follows `language`. */
  voiceLanguage?: UiLanguage;
}

/** The language the automatic voice should speak. */
export function voiceLanguageOf(settings: { language: UiLanguage; voiceLanguage?: UiLanguage }): UiLanguage {
  return settings.voiceLanguage ?? settings.language;
}

/** Machine-readable reasons a request failed, so clients can explain them in their own language. */
export type ApiErrorCode =
  | "slot-occupied"
  | "nothing-to-repeat"
  | "board-not-found"
  | "key-not-found"
  | "last-board"
  | "invalid-board"
  | "client-action"
  | "obs-unavailable";

export interface ErrorResponse {
  /** Technical detail in English. */
  readonly error: string;
  readonly code?: ApiErrorCode;
}
