import {
  ObsRequestError,
  ObsUnavailableError,
  type ObsConnectionConfig,
  type ObsController,
  type ObsControllerEvent,
  type ObsInput,
  type ObsSceneItem,
  type ObsState,
  type ObsStatus,
} from "@speed-deck/core";
import type { ObsClient, ObsClientError } from "./obs-client";

/** obs-websocket close code for a wrong or missing password. */
const AUTHENTICATION_FAILED = 4009;
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 10_000;

const EMPTY_STATE: ObsState = { currentScene: null, mutedInputs: [], streaming: false, recording: false };

export interface ObsConnectionManagerOptions {
  createClient: () => ObsClient;
  log?: (message: string) => void;
  /** How long one connection attempt may take before it counts as failed. */
  attemptTimeoutMs?: number;
}

/**
 * Keeps the desktop connected to OBS: connects on demand, reconnects with exponential backoff
 * (1 s doubling up to 30 s) and tracks the state deck keys reflect. A wrong password stops retrying
 * until `connect` is called again. Never throws from events or timers; the password is never logged.
 */
export class ObsConnectionManager implements ObsController {
  private readonly listeners = new Set<(event: ObsControllerEvent) => void>();
  private readonly log: (message: string) => void;
  private readonly attemptTimeoutMs: number;
  private config: ObsConnectionConfig | null = null;
  private client: ObsClient | null = null;
  /** Increases on every attempt and disconnect; events from older clients are ignored. */
  private generation = 0;
  /** Increases on every connect and disconnect, so a connect that waited for `stop` knows it was superseded. */
  private lifecycleRequests = 0;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = FIRST_RETRY_MS;
  private currentStatus: ObsStatus = { status: "disconnected" };
  private currentState: ObsState = EMPTY_STATE;

  constructor(private readonly options: ObsConnectionManagerOptions) {
    this.log = options.log ?? (() => {});
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  }

  async connect(config: ObsConnectionConfig): Promise<ObsStatus> {
    if (this.closed) return this.currentStatus;
    const request = ++this.lifecycleRequests;
    await this.stop();
    // A later connect, disconnect or close arrived while the old connection was stopping: it wins.
    if (this.closed || request !== this.lifecycleRequests) return this.currentStatus;
    this.config = { ...config };
    this.retryDelay = FIRST_RETRY_MS;
    return this.attempt();
  }

  async disconnect(): Promise<void> {
    this.lifecycleRequests += 1;
    this.config = null;
    await this.stop();
    this.setStatus({ status: "disconnected" });
  }

  /** Disconnects for good: later `connect` calls, retries and pending attempts never open a connection. */
  async close(): Promise<void> {
    this.closed = true;
    await this.disconnect();
  }

  status(): ObsStatus {
    return this.currentStatus;
  }

  state(): ObsState {
    return this.currentState;
  }

  subscribe(listener: (event: ObsControllerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listScenes(): Promise<string[]> {
    const { scenes } = await this.request("GetSceneList");
    // OBS lists scenes bottom-up; keep its order.
    return asArray(scenes).flatMap((scene) => (typeof scene.sceneName === "string" ? [scene.sceneName] : []));
  }

  async listInputs(): Promise<ObsInput[]> {
    const { inputs } = await this.request("GetInputList");
    return asArray(inputs).flatMap((input) =>
      typeof input.inputName === "string" ? [{ name: input.inputName, kind: typeof input.inputKind === "string" ? input.inputKind : "" }] : [],
    );
  }

  async listSceneItems(sceneName: string): Promise<ObsSceneItem[]> {
    const { sceneItems } = await this.request("GetSceneItemList", { sceneName });
    return asArray(sceneItems).flatMap((item) =>
      typeof item.sceneItemId === "number" && typeof item.sourceName === "string"
        ? [{ id: item.sceneItemId, sourceName: item.sourceName, enabled: item.sceneItemEnabled === true }]
        : [],
    );
  }

  async switchScene(sceneName: string): Promise<void> {
    await this.request("SetCurrentProgramScene", { sceneName });
  }

  async toggleMute(inputName: string): Promise<void> {
    await this.request("ToggleInputMute", { inputName });
  }

  async toggleStream(): Promise<void> {
    await this.request("ToggleStream");
  }

  async toggleRecord(): Promise<void> {
    await this.request("ToggleRecord");
  }

  async toggleSourceVisibility(sceneName: string, sourceName: string): Promise<void> {
    const { sceneItemId } = await this.request("GetSceneItemId", { sceneName, sourceName });
    const { sceneItemEnabled } = await this.request("GetSceneItemEnabled", { sceneName, sceneItemId });
    await this.request("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled: sceneItemEnabled !== true });
  }

  async getInputVolume(inputName: string): Promise<number> {
    const { inputVolumeMul } = await this.request("GetInputVolume", { inputName });
    if (typeof inputVolumeMul !== "number") throw new ObsRequestError("OBS did not report a volume.");
    return inputVolumeMul;
  }

  async setInputVolume(inputName: string, volumeMul: number): Promise<void> {
    await this.request("SetInputVolume", { inputName, inputVolumeMul: volumeMul });
  }

  private async request(type: string, data?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = this.client;
    if (!client || this.currentStatus.status !== "connected") throw new ObsUnavailableError();
    try {
      return (await client.call(type, data)) ?? {};
    } catch (error) {
      throw new ObsRequestError(error instanceof Error ? error.message : String(error));
    }
  }

  private async attempt(): Promise<ObsStatus> {
    const config = this.config;
    if (!config || this.closed) return this.currentStatus;
    const generation = ++this.generation;
    const client = this.options.createClient();
    this.client = client;
    this.listen(client, generation);
    this.setStatus({ status: "connecting" });

    try {
      await withTimeout(client.connect(webSocketUrl(config), config.password || undefined), this.attemptTimeoutMs);
    } catch (error) {
      if (generation !== this.generation) return this.discardStale(client);
      this.client = null;
      void client.disconnect().catch(() => {});
      const failure = asClientError(error);
      // The message comes from obs-websocket-js or the network stack and never contains the password.
      this.log(`OBS connection to ${config.host}:${config.port} failed: ${failure.message}`);
      if (failure.code === AUTHENTICATION_FAILED) {
        this.setStatus({ status: "auth-failed" });
      } else {
        this.setStatus({ status: "error", code: "connection-failed" });
        this.scheduleRetry();
      }
      return this.currentStatus;
    }

    // Superseded while connecting: close this socket instead of leaving it open and unused.
    if (generation !== this.generation) return this.discardStale(client);
    this.retryDelay = FIRST_RETRY_MS;
    this.setStatus({ status: "connected" });
    await this.refreshState(client, generation);
    return this.currentStatus;
  }

  private discardStale(client: ObsClient): ObsStatus {
    if (this.client === client) this.client = null;
    void client.disconnect().catch(() => {});
    return this.currentStatus;
  }

  private listen(client: ObsClient, generation: number): void {
    const current = () => generation === this.generation && this.currentStatus.status === "connected";
    const guard = (handler: (data: Record<string, unknown>) => void) => (data: unknown) => {
      try {
        if (current() && typeof data === "object" && data !== null) handler(data as Record<string, unknown>);
      } catch (error) {
        this.log(`Ignored an OBS event that could not be read: ${String(error)}`);
      }
    };

    client.on("ConnectionClosed", (data) => {
      if (!current()) return;
      this.client = null;
      this.log(`OBS connection closed: ${asClientError(data).message}`);
      this.setStatus({ status: "error", code: "connection-lost" });
      this.scheduleRetry();
    });
    client.on(
      "CurrentProgramSceneChanged",
      guard(({ sceneName }) => {
        if (typeof sceneName === "string") this.setState({ currentScene: sceneName });
      }),
    );
    client.on(
      "InputMuteStateChanged",
      guard(({ inputName, inputMuted }) => {
        if (typeof inputName !== "string" || typeof inputMuted !== "boolean") return;
        const others = this.currentState.mutedInputs.filter((name) => name !== inputName);
        this.setState({ mutedInputs: inputMuted ? [...others, inputName] : others });
      }),
    );
    // Part of the Inputs events obs-websocket sends by default (unlike the high-volume InputVolumeMeters).
    client.on(
      "InputVolumeChanged",
      guard(({ inputName, inputVolumeMul }) => {
        if (typeof inputName !== "string" || typeof inputVolumeMul !== "number" || !Number.isFinite(inputVolumeMul)) return;
        this.emit({ type: "input-volume", inputName, volumeMul: inputVolumeMul });
      }),
    );
    client.on(
      "StreamStateChanged",
      guard(({ outputActive }) => {
        if (typeof outputActive === "boolean") this.setState({ streaming: outputActive });
      }),
    );
    client.on(
      "RecordStateChanged",
      guard(({ outputActive }) => {
        if (typeof outputActive === "boolean") this.setState({ recording: outputActive });
      }),
    );
  }

  /** Reads the full state right after connecting; parts OBS cannot answer keep their defaults. */
  private async refreshState(client: ObsClient, generation: number): Promise<void> {
    const read = (type: string, data?: Record<string, unknown>) => client.call(type, data).catch(() => ({}) as Record<string, unknown>);
    const [scenes, stream, record, inputs] = await Promise.all([read("GetSceneList"), read("GetStreamStatus"), read("GetRecordStatus"), read("GetInputList")]);
    const names = asArray(inputs.inputs).flatMap((input) => (typeof input.inputName === "string" ? [input.inputName] : []));
    // Inputs without audio reject GetInputMute; they are simply never muted.
    const mutes = await Promise.all(names.map(async (name) => ((await read("GetInputMute", { inputName: name })).inputMuted === true ? [name] : [])));
    if (generation !== this.generation) return;
    this.currentState = EMPTY_STATE;
    this.setState({
      currentScene: typeof scenes.currentProgramSceneName === "string" ? scenes.currentProgramSceneName : null,
      streaming: stream.outputActive === true,
      recording: record.outputActive === true,
      mutedInputs: mutes.flat(),
    });
  }

  private scheduleRetry(): void {
    if (!this.config || this.closed) return;
    clearTimeout(this.retryTimer);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.attempt().catch((error: unknown) => this.log(`OBS reconnect failed: ${String(error)}`));
    }, delay);
  }

  private async stop(): Promise<void> {
    this.generation += 1;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const client = this.client;
    this.client = null;
    this.currentState = EMPTY_STATE;
    await client?.disconnect().catch(() => {});
  }

  private setStatus(status: ObsStatus): void {
    if (status.status === this.currentStatus.status && status.code === this.currentStatus.code) return;
    this.currentStatus = status;
    this.emit({ type: "status", status });
  }

  private setState(changes: Partial<ObsState>): void {
    this.currentState = { ...this.currentState, ...changes };
    this.emit({ type: "state", state: this.currentState });
  }

  private emit(event: ObsControllerEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.log(`OBS listener failed: ${String(error)}`);
      }
    }
  }
}

function webSocketUrl({ host, port }: ObsConnectionConfig): string {
  return `ws://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

function asClientError(value: unknown): ObsClientError {
  if (typeof value === "object" && value !== null) {
    const { code, message } = value as Record<string, unknown>;
    return { code: typeof code === "number" ? code : undefined, message: typeof message === "string" ? message : "unknown error" };
  }
  return { message: String(value) };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
