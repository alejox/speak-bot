import {
  DESKTOP_SERVER_NAME,
  readStoredBoards,
  type Action,
  type ApiErrorCode,
  type AudioDevice,
  type Board,
  type BoardGrid,
  type BoardKind,
  type DesktopSettings,
  type DesktopSettingsPatch,
  type Key,
  type ObsInput,
  type ObsInputVolumeResponse,
  type ObsSceneItem,
  type ObsStatus,
  type ObsStatusResponse,
  type SetKeyRequest,
  type SpeakRequest,
  type SpeechCapabilities,
  type UiLanguage,
  type Voice,
  type Application,
} from "@speed-deck/core";

export class DesktopRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Why the desktop refused, when it said so. */
    readonly code?: ApiErrorCode,
  ) {
    super(message);
    this.name = "DesktopRequestError";
  }
}

/** Mirrors `GET /api/connection` from the desktop server. */
export interface ConnectionInfo {
  port: number;
  /** URLs a phone on the same network can open, best guess first. */
  lanUrls: string[];
  /** Browser Source URL for OBS on the computer. */
  overlayUrl: string;
  /** Custom Browser Dock URL for OBS: the compact app view. */
  dockUrl: string;
}

const DETECT_TIMEOUT_MS = 1500;

/** Thin client for the desktop HTTP API. Uses relative URLs: the app is served by the desktop itself. */
export class DesktopApiClient {
  constructor(private readonly fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init)) {}

  /** Returns the desktop speech capabilities, or null when the page is not served by a Speed Deck desktop. */
  async detect(timeoutMs = DETECT_TIMEOUT_MS): Promise<SpeechCapabilities | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchFn("/api/health", { signal: controller.signal });
      if (!response.ok) return null;
      const body = (await response.json()) as Record<string, unknown>;
      return body.name === DESKTOP_SERVER_NAME && isCapabilities(body.capabilities) ? body.capabilities : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The URLs a phone and OBS use to reach this desktop. */
  async loadConnection(): Promise<ConnectionInfo> {
    const body = await this.request("GET", "/api/connection");
    if (!isConnectionInfo(body)) throw new DesktopRequestError(500, "Unexpected connection info.");
    return body;
  }

  /** Every desktop board in display order; anything invalid the desktop sends is dropped. */
  async listBoards(): Promise<Board[]> {
    return readStoredBoards(await this.request("GET", "/api/boards"));
  }

  createBoard(name: string, kind: BoardKind): Promise<Board> {
    return this.request("POST", "/api/boards", { name, kind }) as Promise<Board>;
  }

  renameBoard(boardId: string, name: string): Promise<Board> {
    return this.request("PATCH", `/api/boards/${encodeURIComponent(boardId)}`, { name }) as Promise<Board>;
  }

  /** Rejects with code "last-board" for the only board. */
  async deleteBoard(boardId: string): Promise<void> {
    await this.request("DELETE", `/api/boards/${encodeURIComponent(boardId)}`);
  }

  /** Puts a key at `slot`; an occupied slot rejects with code "slot-occupied" unless `replace` is set. */
  setKey(boardId: string, slot: number, key: Omit<SetKeyRequest, "replace">, { replace = false } = {}): Promise<Key> {
    const body: SetKeyRequest = replace ? { ...key, replace: true } : key;
    return this.request("PUT", `${keysPath(boardId)}/${slot}`, body) as Promise<Key>;
  }

  async clearKey(boardId: string, slot: number): Promise<void> {
    await this.request("DELETE", `${keysPath(boardId)}/${slot}`);
  }

  /** Moves the key at `from` to `to`, swapping with a key already there. */
  moveKey(boardId: string, from: number, to: number): Promise<Board> {
    return this.request("POST", `${keysPath(boardId)}/move`, { from, to }) as Promise<Board>;
  }

  /** Gives every board the grid `columns` × `rows`; keys that no longer fit move ("grid-full" when there is no room). */
  setBoardGrid(grid: BoardGrid): Promise<Board[]> {
    return this.request("PUT", "/api/boards/grid", { columns: grid.columns, rows: grid.rows }) as Promise<Board[]>;
  }

  /** Puts back the built-in communication board in `language`. */
  restoreDefaultBoard(language: UiLanguage, boardId?: string): Promise<Board> {
    return this.request("POST", "/api/boards/restore-default", boardId === undefined ? { language } : { language, boardId }) as Promise<Board>;
  }

  /** Runs a voice, captions or OBS action on the desktop; navigation actions are refused ("client-action"). */
  executeAction(action: Action): Promise<{ ok: true; captionsVisible?: boolean; voiceLanguage?: UiLanguage }> {
    return this.request("POST", "/api/actions/execute", { action }) as Promise<{ ok: true }>;
  }

  /** The applications an "open application" key can open, sorted by name by the desktop. */
  async listApplications(): Promise<Application[]> {
    const body = await this.request("GET", "/api/applications");
    if (!Array.isArray(body)) throw new DesktopRequestError(500, "Unexpected applications list.");
    return body.filter((item): item is Application => typeof item === "object" && item !== null && typeof (item as Application).id === "string" && typeof (item as Application).name === "string");
  }

  async speak(request: SpeakRequest): Promise<void> {
    await this.request("POST", "/api/speak", request);
  }

  /** Tells the desktop whether someone is typing something to say: a flag for the overlay, never the text. */
  async setComposing(composing: boolean): Promise<void> {
    await this.request("PUT", "/api/composing", { composing });
  }

  async stop(): Promise<void> {
    await this.request("POST", "/api/stop", {});
  }

  /** Says the last spoken text again; rejects with code "nothing-to-repeat" when there is none. */
  async repeat(): Promise<void> {
    await this.request("POST", "/api/repeat", {});
  }

  /** Hides the current OBS caption right away. */
  async clearCaption(): Promise<void> {
    await this.request("POST", "/api/captions/clear", {});
  }

  listVoices(): Promise<Voice[]> {
    return this.request("GET", "/api/voices") as Promise<Voice[]>;
  }

  listDevices(): Promise<AudioDevice[]> {
    return this.request("GET", "/api/devices") as Promise<AudioDevice[]>;
  }

  loadSettings(): Promise<DesktopSettings> {
    return this.request("GET", "/api/settings") as Promise<DesktopSettings>;
  }

  /** OBS connection status and state (scene, muted inputs, streaming, recording). */
  loadObsStatus(): Promise<ObsStatusResponse> {
    return this.request("GET", "/api/obs/status") as Promise<ObsStatusResponse>;
  }

  /** Rejects with code "obs-unavailable" while OBS is not connected (also the other OBS lists). */
  listObsScenes(): Promise<string[]> {
    return this.request("GET", "/api/obs/scenes") as Promise<string[]>;
  }

  listObsInputs(): Promise<ObsInput[]> {
    return this.request("GET", "/api/obs/inputs") as Promise<ObsInput[]>;
  }

  /** An input's volume as OBS's multiplier; "obs-request-failed" when OBS has no such input with audio. */
  async getObsInputVolume(inputName: string): Promise<number> {
    const { volumeMul } = (await this.request("GET", obsVolumePath(inputName))) as ObsInputVolumeResponse;
    return volumeMul;
  }

  async setObsInputVolume(inputName: string, volumeMul: number): Promise<void> {
    await this.request("PUT", obsVolumePath(inputName), { volumeMul });
  }

  listObsSceneItems(sceneName: string): Promise<ObsSceneItem[]> {
    return this.request("GET", `/api/obs/scenes/${encodeURIComponent(sceneName)}/items`) as Promise<ObsSceneItem[]>;
  }

  /** Connects again with the saved OBS settings; resolves with the first attempt's status ("obs-disabled" when off). */
  connectObs(): Promise<ObsStatus> {
    return this.request("POST", "/api/obs/connect", {}) as Promise<ObsStatus>;
  }

  /** Fields left out keep their value; `obs.password` is write-only (an empty string removes it). */
  saveSettings(patch: DesktopSettingsPatch): Promise<DesktopSettings> {
    return this.request("PUT", "/api/settings", patch) as Promise<DesktopSettings>;
  }

  private async request(method: string, url: string, body?: unknown): Promise<unknown> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await this.fetchFn(url, init);
    if (response.status === 204) return undefined;
    const payload = (await response.json().catch(() => undefined)) as unknown;
    if (!response.ok) {
      const { error, code } = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
      const message = typeof error === "string" ? error : `Request failed with status ${response.status}.`;
      throw new DesktopRequestError(response.status, message, typeof code === "string" ? (code as ApiErrorCode) : undefined);
    }
    return payload;
  }
}

function keysPath(boardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/keys`;
}

function isConnectionInfo(value: unknown): value is ConnectionInfo {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.port === "number" &&
    Array.isArray(candidate.lanUrls) &&
    candidate.lanUrls.every((url) => typeof url === "string") &&
    typeof candidate.overlayUrl === "string" &&
    typeof candidate.dockUrl === "string"
  );
}

function isCapabilities(value: unknown): value is SpeechCapabilities {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.platform === "string" &&
    typeof candidate.engine === "string" &&
    typeof candidate.supportsDeviceSelection === "boolean"
  );
}

function obsVolumePath(inputName: string): string {
  return `/api/obs/inputs/${encodeURIComponent(inputName)}/volume`;
}
