import {
  DESKTOP_SERVER_NAME,
  type AudioDevice,
  type DesktopSettings,
  type Phrase,
  type SpeakRequest,
  type SpeechCapabilities,
  type Voice,
} from "@speak-bot/core";

export class DesktopRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DesktopRequestError";
  }
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

  listPhrases(): Promise<unknown> {
    return this.request("GET", "/api/phrases");
  }

  async savePhrase(phrase: Phrase): Promise<void> {
    await this.request("POST", "/api/phrases", phrase);
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
      const message =
        typeof payload === "object" && payload !== null && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Request failed with status ${response.status}.`;
      throw new DesktopRequestError(response.status, message);
    }
    return payload;
  }
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
