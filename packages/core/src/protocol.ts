/**
 * Wire protocol shared by the desktop server and its clients (mobile app, OBS overlay).
 * Pure types and tiny guards only: no runtime dependencies.
 */
import type { Phrase } from "./domain/phrase";
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
  readonly phraseId?: string;
  /** Epoch milliseconds. */
  readonly at: number;
}

export interface SpeakingEvent {
  readonly type: "speaking";
  readonly state: "start" | "end";
  readonly at: number;
}

export interface PhrasesChangedEvent {
  readonly type: "phrases-changed";
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

export type ServerEvent = CaptionEvent | SpeakingEvent | PhrasesChangedEvent | SpeakErrorEvent;

export function isServerEvent(value: unknown): value is ServerEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.at !== "number") return false;
  switch (event.type) {
    case "caption":
      return typeof event.text === "string" && (event.phraseId === undefined || typeof event.phraseId === "string");
    case "speaking":
      return event.state === "start" || event.state === "end";
    case "phrases-changed":
      return true;
    case "speak-error":
      return typeof event.message === "string" && (event.code === undefined || typeof event.code === "string");
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

/** GET /api/phrases → Phrase[]; POST /api/phrases with this body → Phrase; DELETE /api/phrases/:id → 204. */
export interface SavePhraseRequest {
  /** Client-generated id; the server generates one when omitted. Saving an existing id replaces it. */
  id?: string;
  text: string;
  label?: string;
  createdAt?: number;
}

export type PhrasesResponse = Phrase[];

/** POST /api/speak → 202. Either `text` or `phraseId` is required. */
export interface SpeakRequest {
  text?: string;
  phraseId?: string;
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
  /** Interface language; also picks the default voice and the first-run phrases. */
  language: UiLanguage;
}

export interface ErrorResponse {
  readonly error: string;
}
