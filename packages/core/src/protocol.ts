/**
 * Wire protocol shared by the desktop server and its clients (mobile app, OBS overlay).
 * Pure types and tiny guards only: no runtime dependencies.
 */
import type { Action, ActionType } from "./domain/actions";
import type { Board, BoardKind, Key, KeySpan } from "./domain/board";
import type { Application } from "./ports/application-launcher";
import type { ObsConnectionStatus, ObsErrorCode, ObsInput, ObsSceneItem, ObsState } from "./ports/obs-controller";
import type { SpeakMode, Voice } from "./ports/speech-synthesizer";

/** Longest text the desktop server accepts for a single utterance. */
export const MAX_SPEAK_TEXT_LENGTH = 1000;

/** Identifies a Speed Deck desktop server in the health response. */
export const DESKTOP_SERVER_NAME = "speed-deck-desktop";

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

/** The desktop's connection to OBS changed. */
export interface ObsStatusEvent {
  readonly type: "obs-status";
  readonly status: ObsConnectionStatus;
  readonly code?: ObsErrorCode;
  readonly at: number;
}

/** OBS changed scene, mute, stream or record state (only sent while connected). */
export interface ObsStateEvent {
  readonly type: "obs-state";
  readonly state: ObsState;
  readonly at: number;
}

/** An OBS input's volume changed (from a slider key, OBS itself or anything else); `volumeMul` is OBS's multiplier, 1 = 0 dB. */
export interface ObsInputVolumeEvent {
  readonly type: "obs-input-volume";
  readonly inputName: string;
  readonly volumeMul: number;
  readonly at: number;
}

/** The desktop settings changed (from any client, the tray or an action key); never holds the OBS password. */
export interface SettingsChangedEvent {
  readonly type: "settings-changed";
  readonly settings: DesktopSettings;
  readonly at: number;
}

/**
 * Someone is typing something to say (PUT /api/composing), so the overlay can show a typing sign.
 * A flag only: the text being typed never leaves the device before it is spoken.
 */
export interface ComposingEvent {
  readonly type: "composing";
  readonly composing: boolean;
  readonly at: number;
}

/** The desktop turns the composing flag off by itself this long after the last PUT /api/composing. */
export const COMPOSING_TIMEOUT_MS = 10_000;

/** A key on a board, e.g. the one whose multi-action is running. */
export interface KeyRef {
  readonly boardId: string;
  readonly slot: number;
}

/** A step of a multi-action that failed; the steps after it still ran. */
export interface MultiActionStepFailure {
  /** 0-based position of the step. */
  readonly index: number;
  readonly type: ActionType;
  /** Technical detail in English. */
  readonly message: string;
}

/**
 * A multi-action started or ended on the desktop. `runId` names the run (`<boardId>:<slot>` when the key that
 * started it is known, which `key` then holds). On "end", `failures` lists the steps that failed.
 */
export interface MultiActionEvent {
  readonly type: "multi-action";
  readonly runId: string;
  readonly key?: KeyRef;
  readonly state: "start" | "end";
  readonly failures?: readonly MultiActionStepFailure[];
  readonly at: number;
}

/** The remove-ads license was activated, removed or re-validated on the computer. */
export interface LicenseChangedEvent {
  readonly type: "license-changed";
  readonly license: LicenseResponse;
  readonly at: number;
}

/**
 * Whether an OBS overlay that can play the voice is connected (output "obs" or "both"). While none is, the
 * desktop speaks on the speakers so the person is never silent, and clients can warn about it.
 */
export interface OverlayAudioEvent {
  readonly type: "overlay-audio";
  readonly connected: boolean;
  readonly at: number;
}

export type ServerEvent =
  | OverlayAudioEvent
  | MultiActionEvent
  | LicenseChangedEvent
  | SettingsChangedEvent
  | ComposingEvent
  | CaptionEvent
  | SpeakingEvent
  | BoardsChangedEvent
  | SpeakErrorEvent
  | CaptionClearEvent
  | CaptionsVisibilityEvent
  | ObsStatusEvent
  | ObsStateEvent
  | ObsInputVolumeEvent;

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
    case "overlay-audio":
      return typeof event.connected === "boolean";
    case "speak-error":
      return typeof event.message === "string" && (event.code === undefined || typeof event.code === "string");
    case "caption-clear":
      return true;
    case "captions-visibility":
      return typeof event.visible === "boolean";
    case "composing":
      return typeof event.composing === "boolean";
    case "obs-status":
      return typeof event.status === "string" && (event.code === undefined || typeof event.code === "string");
    case "obs-state":
      return isObsState(event.state);
    case "obs-input-volume":
      return typeof event.inputName === "string" && typeof event.volumeMul === "number" && Number.isFinite(event.volumeMul);
    case "license-changed":
      return isLicenseResponse(event.license);
    case "multi-action":
      return (
        typeof event.runId === "string" &&
        (event.state === "start" || event.state === "end") &&
        (event.key === undefined || isKeyRef(event.key)) &&
        (event.failures === undefined || Array.isArray(event.failures))
      );
    case "settings-changed":
      return typeof event.settings === "object" && event.settings !== null && isUiLanguage((event.settings as { language?: unknown }).language);
    default:
      return false;
  }
}

function isKeyRef(value: unknown): value is KeyRef {
  if (typeof value !== "object" || value === null) return false;
  const key = value as Record<string, unknown>;
  return typeof key.boardId === "string" && typeof key.slot === "number";
}

function isLicenseResponse(value: unknown): value is LicenseResponse {
  if (typeof value !== "object" || value === null) return false;
  const license = value as Record<string, unknown>;
  return typeof license.adsFree === "boolean" && typeof license.canActivate === "boolean";
}

function isObsState(value: unknown): value is ObsState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    (state.currentScene === null || typeof state.currentScene === "string") &&
    Array.isArray(state.mutedInputs) &&
    state.mutedInputs.every((name) => typeof name === "string") &&
    typeof state.streaming === "boolean" &&
    typeof state.recording === "boolean" &&
    (state.hiddenSources === undefined || (Array.isArray(state.hiddenSources) && state.hiddenSources.every(isObsSceneSource))) &&
    (state.monitoredInputs === undefined || (Array.isArray(state.monitoredInputs) && state.monitoredInputs.every((name) => typeof name === "string")))
  );
}

function isObsSceneSource(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;
  return typeof source.sceneName === "string" && typeof source.sourceName === "string";
}

// ---- Voice clips for the OBS overlay ----

/** Where the desktop voice is heard: the computer's speakers, the OBS overlay (its own OBS audio channel), or both. */
export const VOICE_OUTPUTS = ["speakers", "obs", "both"] as const;
export type VoiceOutput = (typeof VOICE_OUTPUTS)[number];
export const DEFAULT_VOICE_OUTPUT: VoiceOutput = "speakers";

export function isVoiceOutput(value: unknown): value is VoiceOutput {
  return typeof value === "string" && (VOICE_OUTPUTS as readonly string[]).includes(value);
}

/** The overlay connects to `/ws?client=overlay` to receive voice clips and report their playback. */
export const OVERLAY_CLIENT_QUERY = "client=overlay";

/** Id of a rendered voice clip: 32 lowercase hex characters, also its file name. */
export const VOICE_CLIP_ID = /^[0-9a-f]{32}$/;

/** Desktop → overlay (only overlay sockets): play this clip once every earlier one finished. */
export interface VoiceClipEvent {
  readonly type: "voice-clip";
  readonly id: string;
  /** Same-origin path of the WAV file, valid only while the clip is playing or waiting. */
  readonly url: string;
  readonly at: number;
}

/** Desktop → overlay: stop this clip now (stop, or a newer utterance cut it off). */
export interface VoiceClipStopEvent {
  readonly type: "voice-clip-stop";
  readonly id: string;
  readonly at: number;
}

export type OverlayCommand = VoiceClipEvent | VoiceClipStopEvent;

/** Overlay → desktop over the same socket: a clip started, finished, or could not be played. */
export interface OverlayClipReport {
  readonly type: "clip-started" | "clip-ended" | "clip-failed";
  readonly id: string;
}

export function isOverlayClipReport(value: unknown): value is OverlayClipReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Record<string, unknown>;
  return (
    (report.type === "clip-started" || report.type === "clip-ended" || report.type === "clip-failed") &&
    typeof report.id === "string" &&
    VOICE_CLIP_ID.test(report.id)
  );
}

/** GET /api/voice/status */
export interface VoiceOutputStatusResponse {
  /** True while an OBS overlay that can play the voice is connected. */
  readonly overlayConnected: boolean;
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
  /** Stable across restarts and IP changes; matches the `id` TXT field of the `_speeddeck._tcp` announcement. */
  readonly desktopId?: string;
}

/** GET /api/boards → Board[] in display order. */
export type BoardsResponse = Board[];

/** PATCH /api/boards/:id → Board. */
export interface BoardNameRequest {
  name: string;
}

/** POST /api/boards → 201 Board: an empty board of `kind`. */
export interface CreateBoardRequest extends BoardNameRequest {
  kind: BoardKind;
}

/**
 * PUT /api/boards/:id/keys/:slot → Key. A slot that already holds a key → 409 "slot-occupied"
 * unless `replace` is true; a key whose cells (`span`) cross the page or meet another key → 409 "no-room". DELETE /api/boards/:id/keys/:slot → 204 (an empty slot is fine).
 */
export interface SetKeyRequest {
  label?: string;
  /** One of `KEY_ICON_IDS`; empty for none. */
  icon?: string;
  /** `#rrggbb`; empty for none. */
  color?: string;
  /** `#rrggbb` shown while the key's toggle is on; empty for none (then `color`). */
  activeColor?: string;
  /** Cells the key covers (only actions with `canSpan`); 1 × 1 when left out. */
  span?: KeySpan;
  action: Action;
  replace?: boolean;
}

/**
 * POST /api/boards/:id/keys/move → Board. A 1 × 1 key already at `to` is swapped to `from`; no room
 * for the moved key's whole block → 409 "no-room".
 */
export interface MoveKeyRequest {
  from: number;
  to: number;
}

/**
 * PUT /api/boards/grid → Board[]: gives every board of `kind` this grid, within that kind's range
 * (`BOARD_GRID_RANGES`; 400 "invalid-board" otherwise), moving keys that no longer fit (see `reflowBoard`).
 * Boards of the other kind keep theirs. No room for every key → 409 "grid-full".
 */
export interface SetBoardGridRequest {
  kind: BoardKind;
  columns: number;
  rows: number;
}

/**
 * POST /api/boards/restore-default → Board: puts back a built-in board, the communication board
 * unless `boardId` names the built-in deck board.
 */
export interface RestoreDefaultBoardRequest {
  language: UiLanguage;
  boardId?: string;
}

/**
 * POST /api/actions/execute → 200 `{ ok: true }` (202 for speech, which runs in the background).
 * Navigation actions run in each client → 400 "client-action". A multi-action → 202 when it started
 * (it runs in the background and reports through `multi-action` events), or 200 `{ ok: true, ignored: true }`
 * while the same key's sequence still runs.
 */
export interface ExecuteActionRequest {
  action: Action;
  /** The key pressed, so a multi-action runs once per key at a time and clients can show it running. */
  key?: KeyRef;
}

/** POST /api/boards/:id/folders → 201 `CreateFolderResponse`: a folder in that board and the key that opens it. */
export interface CreateFolderRequest {
  slot: number;
  /** The key's label and the folder's name. */
  label: string;
  icon?: string;
  color?: string;
}

export interface CreateFolderResponse {
  folder: Board;
  key: Key;
}

export type { Board, Key };

/**
 * POST /api/speak → 202. With `mode: "queue"` the text waits behind what is being said (409 "queue-full"
 * when too many already wait); otherwise it interrupts it and empties the queue.
 */
export interface SpeakRequest {
  text: string;
  voiceId?: string;
  /** Speaking rate multiplier, 1 is normal speed. */
  rate?: number;
  /** "interrupt" when left out. */
  mode?: SpeakMode;
}

/**
 * PUT /api/composing → 200 `{ ok: true }`. True while text is being typed to speak on the desktop; send it
 * again within `COMPOSING_TIMEOUT_MS` to keep it on. Only the flag is read: never send the text.
 */
export interface ComposingRequest {
  composing: boolean;
}

/**
 * GET /api/applications → the applications a `system.openApp` key can open, sorted by name; empty where the
 * desktop cannot open applications. Running the key with any other id → 404 "app-not-found".
 */
export type ApplicationsResponse = Application[];

/** GET /api/voices */
export type VoicesResponse = Voice[];

export interface AudioDevice {
  /** Value passed to the system TTS to select this output device. */
  readonly id: string;
  readonly name: string;
}

/** GET /api/devices */
export type DevicesResponse = AudioDevice[];

/** GET /api/settings; PUT /api/settings with a `DesktopSettingsPatch` body → full settings. */
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
  /** Where the voice is heard; absent (older desktops) means the speakers. */
  voiceOutput?: VoiceOutput;
  /** OBS connection; always sent by the desktop. */
  obs?: ObsSettingsView;
}

/** OBS connection settings as the API shows them: the password itself is never sent. */
export interface ObsSettingsView {
  enabled: boolean;
  host: string;
  port: number;
  hasPassword: boolean;
}

/** PUT /api/settings `obs` field: fields left out keep their value; an empty password removes it. */
export interface ObsSettingsPatch {
  enabled?: boolean;
  host?: string;
  port?: number;
  password?: string;
}

/** PUT /api/settings body. */
export type DesktopSettingsPatch = Partial<Omit<DesktopSettings, "obs">> & { obs?: ObsSettingsPatch };

/** GET /api/obs/status */
export interface ObsStatusResponse {
  /** `obs.enabled` from the settings. */
  readonly enabled: boolean;
  readonly status: ObsConnectionStatus;
  readonly code?: ObsErrorCode;
  readonly state: ObsState;
}

/** GET /api/obs/scenes → scene names; GET /api/obs/inputs; GET /api/obs/scenes/:name/items. 409 "obs-unavailable" when not connected. */
export type ObsScenesResponse = string[];
export type ObsInputsResponse = ObsInput[];
export type ObsSceneItemsResponse = ObsSceneItem[];

/**
 * GET /api/obs/inputs/:name/volume → the input's volume as OBS's multiplier (1 = 0 dB); 502
 * "obs-request-failed" when the input does not exist or has no audio. PUT the same path with
 * `SetObsInputVolumeRequest` → 200 `{ ok: true }`; OBS then reports the change as an obs-input-volume event.
 */
export interface ObsInputVolumeResponse {
  readonly inputName: string;
  readonly volumeMul: number;
}

/** `volumeMul` from 0 to `MAX_OBS_VOLUME_MUL`. */
export interface SetObsInputVolumeRequest {
  volumeMul: number;
}

/**
 * GET /api/license → whether ads are removed on this computer and every paired phone. PUT /api/license
 * with `ActivateLicenseRequest` activates a key and DELETE removes it (both only from the computer itself,
 * else 403 "loopback-only"); both answer with the new `LicenseResponse` and broadcast license-changed.
 */
export interface LicenseResponse {
  readonly adsFree: boolean;
  /** False when this build has no license store configured: the key field is hidden. */
  readonly canActivate: boolean;
  /** The saved key with all but its last 4 characters hidden. */
  readonly maskedKey?: string;
  /** Epoch ms of the last answer from the license server. */
  readonly lastValidatedAt?: number;
  /** Where to buy a key (opened outside the app); absent when not configured. */
  readonly checkoutUrl?: string;
}

/** A sponsor banner as GET /api/ad serves it; remote URLs other than `linkUrl` never reach clients. */
export interface AdCreative {
  readonly id: string;
  readonly title: string;
  readonly text?: string;
  /** https URL opened outside the app when the banner is pressed. */
  readonly linkUrl: string;
  /** Path of the cached image on this server (GET /api/ad/image), when the creative has one. */
  readonly imagePath?: string;
  /** Text alternative for the image. */
  readonly alt?: string;
}

/** GET /api/ad → the current sponsor, or null when the house banner should show. */
export interface AdResponse {
  readonly ad: AdCreative | null;
}

export interface ActivateLicenseRequest {
  key: string;
}

/** The language the automatic voice should speak. */
export function voiceLanguageOf(settings: { language: UiLanguage; voiceLanguage?: UiLanguage }): UiLanguage {
  return settings.voiceLanguage ?? settings.language;
}

/** Machine-readable reasons a request failed, so clients can explain them in their own language. */
export type ApiErrorCode =
  | "slot-occupied"
  | "no-room"
  | "nothing-to-repeat"
  | "board-not-found"
  | "key-not-found"
  | "last-board"
  | "invalid-board"
  | "client-action"
  | "obs-unavailable"
  | "obs-disabled"
  | "obs-request-failed"
  | "loopback-only"
  | "board-limit"
  | "grid-full"
  | "queue-full"
  | "app-not-found"
  | "apps-unsupported"
  | "app-open-failed"
  | "license-invalid"
  | "license-wrong-product"
  | "license-limit"
  | "license-offline"
  | "license-disabled";

export interface ErrorResponse {
  /** Technical detail in English. */
  readonly error: string;
  readonly code?: ApiErrorCode;
}
