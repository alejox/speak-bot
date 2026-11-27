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

/** A scene item's transform as obs-websocket reports it: full screen, no crop, no bounding box. */
export function fullScreenTransform(): Record<string, unknown> {
  return {
    sourceWidth: 1920,
    sourceHeight: 1080,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 1920,
    height: 1080,
    alignment: 5,
    boundsType: "OBS_BOUNDS_NONE",
    boundsAlignment: 0,
    boundsWidth: 0,
    boundsHeight: 0,
    cropLeft: 0,
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    cropToBounds: false,
  };
}

/**
 * Typical OBS answers: two scenes, a muted mic, a monitored desktop audio input, not streaming, recording, and
 * one scene item (id 3) whose transform starts full screen and keeps what SetSceneItemTransform sends.
 */
export function obsResponses(): Record<string, Responder> {
  let transform = fullScreenTransform();
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
    GetInputAudioMonitorType: (data) => {
      if (data?.inputName === "Camera") throw new Error("The specified input does not support audio.");
      return { monitorType: data?.inputName === "Desktop Audio" ? "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT" : "OBS_MONITORING_TYPE_NONE" };
    },
    GetSceneItemList: () => ({ sceneItems: [{ sceneItemId: 3, sourceName: "Cam", sceneItemEnabled: true }, { sceneItemId: "bad" }] }),
    GetSceneItemId: () => ({ sceneItemId: 3 }),
    GetSceneItemEnabled: () => ({ sceneItemEnabled: true }),
    GetSceneItemTransform: () => ({ sceneItemTransform: { ...transform } }),
    SetSceneItemTransform: (data) => {
      transform = { ...transform, ...(data?.sceneItemTransform as Record<string, unknown>) };
      return undefined;
    },
    GetInputVolume: (data) => {
      if (data?.inputName === "Camera") throw new Error("The specified input does not support audio.");
      return { inputVolumeMul: 0.5, inputVolumeDb: -6.02 };
    },
  };
}
