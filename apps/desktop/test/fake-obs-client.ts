import type { ObsClient, ObsClientError } from "../src/adapters/obs/obs-client";

type Responder = (data: Record<string, unknown> | undefined) => unknown;

/** A scripted obs-websocket client: records connects and requests, answers from `responses`, emits events on demand. */
export class FakeObsClient implements ObsClient {
  static created: FakeObsClient[] = [];
  readonly connects: Array<{ url: string; password: string | undefined }> = [];
  readonly calls: Array<{ type: string; data: Record<string, unknown> | undefined }> = [];
  disconnected = false;
  private readonly listeners = new Map<string, Array<(data: unknown) => void>>();

  constructor(
    private readonly failConnect: ObsClientError | null,
    readonly responses: Record<string, Responder>,
  ) {
    FakeObsClient.created.push(this);
  }

  async connect(url: string, password?: string): Promise<void> {
    this.connects.push({ url, password });
    if (this.failConnect) throw Object.assign(new Error(this.failConnect.message), { code: this.failConnect.code });
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }

  async call(type: string, data?: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ type, data });
    const responder = this.responses[type];
    if (!responder) return {};
    return (await responder(data)) as Record<string, unknown>;
  }

  on(event: string, listener: (data: unknown) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string, data?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(data);
  }
}

/** Typical OBS answers: two scenes, a muted mic, a desktop audio input, not streaming, recording. */
export function obsResponses(): Record<string, Responder> {
  return {
    GetSceneList: () => ({ currentProgramSceneName: "Main", scenes: [{ sceneName: "BRB" }, { sceneName: "Main" }] }),
    GetStreamStatus: () => ({ outputActive: false }),
    GetRecordStatus: () => ({ outputActive: true }),
    GetInputList: () => ({
      inputs: [
        { inputName: "Mic", inputKind: "coreaudio_input_capture" },
        { inputName: "Desktop Audio", inputKind: "coreaudio_output_capture" },
        { inputName: "Camera", inputKind: "av_capture_input" },
      ],
    }),
    GetInputMute: (data) => {
      if (data?.inputName === "Camera") throw new Error("The specified input does not support audio.");
      return { inputMuted: data?.inputName === "Mic" };
    },
    GetSceneItemList: () => ({ sceneItems: [{ sceneItemId: 3, sourceName: "Cam", sceneItemEnabled: true }, { sceneItemId: "bad" }] }),
    GetSceneItemId: () => ({ sceneItemId: 3 }),
    GetSceneItemEnabled: () => ({ sceneItemEnabled: true }),
    GetInputVolume: (data) => {
      if (data?.inputName === "Camera") throw new Error("The specified input does not support audio.");
      return { inputVolumeMul: 0.5, inputVolumeDb: -6.02 };
    },
  };
}
