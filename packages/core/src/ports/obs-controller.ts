/** Where the desktop reaches OBS (obs-websocket v5, OBS → Tools → WebSocket Server Settings). */
export interface ObsConnectionConfig {
  host: string;
  port: number;
  /** Empty when the OBS WebSocket server has no password. */
  password: string;
}

/** Connection state; "auth-failed" waits for new settings instead of retrying. */
export type ObsConnectionStatus = "disconnected" | "connecting" | "connected" | "auth-failed" | "error";

/** Why the connection is in the "error" state, so clients can explain it in their own language. */
export type ObsErrorCode = "connection-failed" | "connection-lost";

export interface ObsStatus {
  readonly status: ObsConnectionStatus;
  readonly code?: ObsErrorCode;
}

/** A source placed in a scene (a scene item), named the way OBS names it. */
export interface ObsSceneSource {
  readonly sceneName: string;
  readonly sourceName: string;
}

/** What deck keys reflect: the program scene, muted inputs, whether OBS streams or records and which sources are hidden. */
export interface ObsState {
  readonly currentScene: string | null;
  readonly mutedInputs: readonly string[];
  readonly streaming: boolean;
  readonly recording: boolean;
  /** Scene items hidden in OBS; missing when unknown (OBS could not list them, or an older desktop). */
  readonly hiddenSources?: readonly ObsSceneSource[];
}

export interface ObsInput {
  readonly name: string;
  /** OBS input kind, e.g. "wasapi_input_capture" or "coreaudio_input_capture". */
  readonly kind: string;
}

export interface ObsSceneItem {
  readonly id: number;
  readonly sourceName: string;
  readonly enabled: boolean;
}

/** Highest volume multiplier OBS accepts for an input (+26 dB). */
export const MAX_OBS_VOLUME_MUL = 20;

export type ObsControllerEvent =
  | { type: "status"; status: ObsStatus }
  | { type: "state"; state: ObsState }
  /** An input's volume changed in OBS, from any source; `volumeMul` is OBS's multiplier (1 = 0 dB). */
  | { type: "input-volume"; inputName: string; volumeMul: number };

/** OBS is not connected, so OBS actions and lists are unavailable. */
export class ObsUnavailableError extends Error {
  constructor(message = "OBS is not connected.") {
    super(message);
    this.name = "ObsUnavailableError";
  }
}

/** OBS refused a request (e.g. the scene does not exist). The message is OBS's own, in English. */
export class ObsRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObsRequestError";
  }
}

/** Controls OBS. Methods other than connect/disconnect/status/state reject with `ObsUnavailableError` while not connected. */
export interface ObsController {
  /** Connects (dropping any current connection) and keeps reconnecting; resolves after the first attempt. */
  connect(config: ObsConnectionConfig): Promise<ObsStatus>;
  /** Disconnects and stops reconnecting. */
  disconnect(): Promise<void>;
  status(): ObsStatus;
  state(): ObsState;
  listScenes(): Promise<string[]>;
  listInputs(): Promise<ObsInput[]>;
  listSceneItems(sceneName: string): Promise<ObsSceneItem[]>;
  switchScene(sceneName: string): Promise<void>;
  toggleMute(inputName: string): Promise<void>;
  toggleStream(): Promise<void>;
  toggleRecord(): Promise<void>;
  toggleSourceVisibility(sceneName: string, sourceName: string): Promise<void>;
  /** An input's volume as OBS's multiplier (1 = 0 dB); `ObsRequestError` when it has no audio or does not exist. */
  getInputVolume(inputName: string): Promise<number>;
  /** Sets an input's volume as a multiplier from 0 to `MAX_OBS_VOLUME_MUL`. */
  setInputVolume(inputName: string, volumeMul: number): Promise<void>;
  /** Status, state and input volume changes. Returns an unsubscribe function. */
  subscribe(listener: (event: ObsControllerEvent) => void): () => void;
}
