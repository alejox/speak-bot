import {
  DESKTOP_SERVER_NAME,
  type ApiErrorCode,
  type AudioDevice,
  type DesktopSettings,
  type Phrase,
  type SpeakRequest,
  type SpeechCapabilities,
  type UiLanguage,
  type UpdatePhraseRequest,
  type Voice,
} from "@speak-bot/core";

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

  /** Returns the desktop speech capabilities, or null when the page is not served by a speak-bot desktop. */
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

  listPhrases(): Promise<unknown> {
    return this.request("GET", "/api/phrases");
  }

  async savePhrase(phrase: Phrase): Promise<void> {
    await this.request("POST", "/api/phrases", phrase);
  }

  /** Changes text, label and slot of an existing phrase; an empty label removes it. */
  async updatePhrase(phrase: Phrase): Promise<void> {
    const body: UpdatePhraseRequest = { text: phrase.text, label: phrase.label ?? "", slot: phrase.slot };
    await this.request("PUT", `/api/phrases/${encodeURIComponent(phrase.id)}`, body);
  }

  /** Replaces every desktop phrase with the default set in `language`. */
  async restorePhrases(language: UiLanguage): Promise<void> {
    await this.request("POST", "/api/phrases/restore", { language });
  }

  async deletePhrase(id: string): Promise<void> {
    await this.request("DELETE", `/api/phrases/${encodeURIComponent(id)}`);
  }

  async speak(request: SpeakRequest): Promise<void> {
    await this.request("POST", "/api/speak", request);
  }

  async stop(): Promise<void> {
    await this.request("POST", "/api/stop", {});
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

  saveSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
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
