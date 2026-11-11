import { ObsRequestError, ObsUnavailableError, type ObsControllerEvent } from "@speed-deck/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObsConnectionManager } from "../../src/adapters/obs/obs-connection-manager";
import { FakeObsClient, obsResponses } from "../fake-obs-client";

const config = { host: "127.0.0.1", port: 4455, password: "s3cret-pass" };
const refused = { code: 1006, message: "connect ECONNREFUSED 127.0.0.1:4455" };

describe("ObsConnectionManager", () => {
  let logs: string[];
  let events: ObsControllerEvent[];
  let failures: Array<typeof refused | null>;
  let manager: ObsConnectionManager;

  beforeEach(() => {
    FakeObsClient.created = [];
    logs = [];
    events = [];
    failures = [];
    manager = new ObsConnectionManager({
      createClient: () => new FakeObsClient(failures.shift() ?? null, obsResponses()),
      log: (message) => logs.push(message),
    });
    manager.subscribe((event) => events.push(event));
  });

  afterEach(async () => {
    await manager.disconnect();
    vi.useRealTimers();
  });

  const statuses = () => events.flatMap((event) => (event.type === "status" ? [event.status] : []));

  it("connects, reads the OBS state and reports connecting then connected", async () => {
    expect(manager.status()).toEqual({ status: "disconnected" });
    expect(await manager.connect(config)).toEqual({ status: "connected" });

    expect(FakeObsClient.created[0]!.connects).toEqual([{ url: "ws://127.0.0.1:4455", password: "s3cret-pass" }]);
    expect(statuses()).toEqual([{ status: "connecting" }, { status: "connected" }]);
    expect(manager.state()).toEqual({ currentScene: "Main", mutedInputs: ["Mic"], streaming: false, recording: true });
    expect(events.at(-1)).toEqual({ type: "state", state: manager.state() });
  });

  it("connects without a password when none is set and brackets IPv6 hosts", async () => {
    await manager.connect({ host: "::1", port: 4456, password: "" });
    expect(FakeObsClient.created[0]!.connects).toEqual([{ url: "ws://[::1]:4456", password: undefined }]);
  });

  it("retries with exponential backoff capped at 30 seconds", async () => {
    vi.useFakeTimers();
    failures = Array.from({ length: 8 }, () => refused);

    expect(await manager.connect(config)).toEqual({ status: "error", code: "connection-failed" });
    const attemptsAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return FakeObsClient.created.length;
    };
    expect(await attemptsAfter(999)).toBe(1);
    expect(await attemptsAfter(1)).toBe(2);
    expect(await attemptsAfter(2000)).toBe(3);
    expect(await attemptsAfter(4000)).toBe(4);
    expect(await attemptsAfter(8000)).toBe(5);
    expect(await attemptsAfter(16000)).toBe(6);
    expect(await attemptsAfter(29_999)).toBe(6);
    expect(await attemptsAfter(1)).toBe(7);
    expect(await attemptsAfter(30_000)).toBe(8);
    expect(await attemptsAfter(30_000)).toBe(9);
    expect(manager.status()).toEqual({ status: "connected" });
  });

  it("gives up on a wrong password until it is told to connect again", async () => {
    vi.useFakeTimers();
    failures = [{ code: 4009, message: "Authentication failed." }];

    expect(await manager.connect(config)).toEqual({ status: "auth-failed" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeObsClient.created).toHaveLength(1);
  });

  it("gives up on an attempt that hangs", async () => {
    vi.useFakeTimers();
    manager = new ObsConnectionManager({
      createClient: () => {
        const client = new FakeObsClient(null, obsResponses());
        client.connect = () => new Promise(() => {});
        return client;
      },
      log: () => {},
      attemptTimeoutMs: 5000,
    });
    const result = manager.connect(config);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ status: "error", code: "connection-failed" });
    expect(FakeObsClient.created[0]!.disconnected).toBe(true);
  });

  it("reconnects after OBS closes the connection and ignores events from old connections", async () => {
    vi.useFakeTimers();
    await manager.connect(config);
    const first = FakeObsClient.created[0]!;

    first.emit("ConnectionClosed", { code: 1001, message: "OBS closed" });
    expect(manager.status()).toEqual({ status: "error", code: "connection-lost" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.status()).toEqual({ status: "connected" });

    first.emit("ConnectionClosed", { code: 1001, message: "late" });
    first.emit("StreamStateChanged", { outputActive: true });
    expect(manager.status()).toEqual({ status: "connected" });
    expect(manager.state().streaming).toBe(false);
  });

  it("stops reconnecting when disconnected", async () => {
    vi.useFakeTimers();
    failures = [refused];
    await manager.connect(config);
    await manager.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeObsClient.created).toHaveLength(1);
    expect(manager.status()).toEqual({ status: "disconnected" });
  });

  it("forwards scene, mute, stream and record changes as state events", async () => {
    await manager.connect(config);
    const client = FakeObsClient.created[0]!;
    events = [];

    client.emit("CurrentProgramSceneChanged", { sceneName: "BRB" });
    client.emit("InputMuteStateChanged", { inputName: "Desktop Audio", inputMuted: true });
    client.emit("InputMuteStateChanged", { inputName: "Mic", inputMuted: false });
    client.emit("StreamStateChanged", { outputActive: true, outputState: "OBS_WEBSOCKET_OUTPUT_STARTED" });
    client.emit("RecordStateChanged", { outputActive: false, outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED" });
    client.emit("CurrentProgramSceneChanged", { sceneName: 42 });

    expect(events.map((event) => event.type)).toEqual(["state", "state", "state", "state", "state"]);
    expect(manager.state()).toEqual({ currentScene: "BRB", mutedInputs: ["Desktop Audio"], streaming: true, recording: false });
  });

  it("maps actions to obs-websocket requests", async () => {
    await manager.connect(config);
    const client = FakeObsClient.created[0]!;
    client.calls.length = 0;

    await manager.switchScene("BRB");
    await manager.toggleMute("Mic");
    await manager.toggleStream();
    await manager.toggleRecord();
    await manager.toggleSourceVisibility("Main", "Cam");

    expect(client.calls).toEqual([
      { type: "SetCurrentProgramScene", data: { sceneName: "BRB" } },
      { type: "ToggleInputMute", data: { inputName: "Mic" } },
      { type: "ToggleStream", data: undefined },
      { type: "ToggleRecord", data: undefined },
      { type: "GetSceneItemId", data: { sceneName: "Main", sourceName: "Cam" } },
      { type: "GetSceneItemEnabled", data: { sceneName: "Main", sceneItemId: 3 } },
      { type: "SetSceneItemEnabled", data: { sceneName: "Main", sceneItemId: 3, sceneItemEnabled: false } },
    ]);
  });

  it("reads and sets an input's volume as a multiplier", async () => {
    await manager.connect(config);
    const client = FakeObsClient.created[0]!;
    client.calls.length = 0;

    expect(await manager.getInputVolume("Mic")).toBe(0.5);
    await manager.setInputVolume("Mic", 0.25);

    expect(client.calls).toEqual([
      { type: "GetInputVolume", data: { inputName: "Mic" } },
      { type: "SetInputVolume", data: { inputName: "Mic", inputVolumeMul: 0.25 } },
    ]);
    await expect(manager.getInputVolume("Camera")).rejects.toThrow(ObsRequestError);
  });

  it("forwards volume changes from OBS as input-volume events and ignores malformed ones", async () => {
    await manager.connect(config);
    const client = FakeObsClient.created[0]!;
    events = [];

    client.emit("InputVolumeChanged", { inputName: "Mic", inputVolumeMul: 0.3, inputVolumeDb: -10.4 });
    client.emit("InputVolumeChanged", { inputName: "Mic", inputVolumeMul: "loud" });
    client.emit("InputVolumeChanged", { inputVolumeMul: 0.3 });

    expect(events).toEqual([{ type: "input-volume", inputName: "Mic", volumeMul: 0.3 }]);
  });

  it("lists scenes, inputs and scene items", async () => {
    await manager.connect(config);
    expect(await manager.listScenes()).toEqual(["BRB", "Main"]);
    expect(await manager.listInputs()).toEqual([
      { name: "Mic", kind: "coreaudio_input_capture" },
      { name: "Desktop Audio", kind: "coreaudio_output_capture" },
      { name: "Camera", kind: "av_capture_input" },
    ]);
    expect(await manager.listSceneItems("Main")).toEqual([{ id: 3, sourceName: "Cam", enabled: true }]);
  });

  it("rejects requests while disconnected and wraps OBS errors", async () => {
    await expect(manager.toggleStream()).rejects.toThrow(ObsUnavailableError);
    await expect(manager.listScenes()).rejects.toThrow(ObsUnavailableError);
    await expect(manager.getInputVolume("Mic")).rejects.toThrow(ObsUnavailableError);
    await expect(manager.setInputVolume("Mic", 1)).rejects.toThrow(ObsUnavailableError);

    await manager.connect(config);
    FakeObsClient.created[0]!.responses.SetCurrentProgramScene = () => {
      throw new Error("No source was found by the name of `Nope`.");
    };
    await expect(manager.switchScene("Nope")).rejects.toThrow(ObsRequestError);
  });

  it("never logs or emits the password", async () => {
    vi.useFakeTimers();
    failures = [refused, { code: 4009, message: "Authentication failed." }];
    await manager.connect(config);
    await vi.advanceTimersByTimeAsync(1000);

    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(config.password);
    expect(JSON.stringify(events)).not.toContain(config.password);
  });

  describe("overlapping lifecycle calls", () => {
    /** A promise the test settles by hand. */
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    let log: string[];
    let pendingConnects: Array<() => void>;
    let pendingDisconnects: Array<() => void>;
    let holdConnect: boolean;
    let holdDisconnect: boolean;

    beforeEach(() => {
      log = [];
      pendingConnects = [];
      pendingDisconnects = [];
      holdConnect = false;
      holdDisconnect = false;
      manager = new ObsConnectionManager({
        createClient: () => {
          const client = new FakeObsClient(null, obsResponses());
          const index = FakeObsClient.created.length - 1;
          client.connect = async (url, password) => {
            client.connects.push({ url, password });
            if (holdConnect) {
              const gate = deferred();
              pendingConnects.push(gate.resolve);
              await gate.promise;
            }
            log.push(`connected ${index}`);
          };
          client.disconnect = async () => {
            log.push(`disconnect ${index}`);
            client.disconnected = true;
            if (holdDisconnect) {
              const gate = deferred();
              pendingDisconnects.push(gate.resolve);
              await gate.promise;
            }
          };
          return client;
        },
        log: () => {},
      });
      manager.subscribe((event) => events.push(event));
    });

    afterEach(() => {
      holdConnect = false;
      holdDisconnect = false;
      for (const release of [...pendingConnects, ...pendingDisconnects]) release();
    });

    it("keeps a disconnect that arrives while a reconnect is still stopping the old connection", async () => {
      await manager.connect(config);
      holdDisconnect = true;

      const reconnecting = manager.connect({ ...config, host: "10.0.0.5" });
      const disconnecting = manager.disconnect();
      for (const release of pendingDisconnects) release();
      await Promise.all([reconnecting, disconnecting]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(FakeObsClient.created).toHaveLength(1);
      expect(manager.status()).toEqual({ status: "disconnected" });
    });

    it("closes a connection that succeeds after it was superseded", async () => {
      holdConnect = true;
      const first = manager.connect(config);
      await vi.waitFor(() => expect(pendingConnects).toHaveLength(1));

      holdConnect = false;
      await manager.connect({ ...config, host: "10.0.0.5" });
      pendingConnects[0]!();
      await first;

      const stale = FakeObsClient.created[0]!;
      expect(log.lastIndexOf("disconnect 0")).toBeGreaterThan(log.indexOf("connected 0"));
      expect(stale.disconnected).toBe(true);
      expect(manager.status()).toEqual({ status: "connected" });
      expect(FakeObsClient.created[1]!.disconnected).toBe(false);
    });

    it("never connects or retries again once closed, even with a connection attempt in flight", async () => {
      vi.useFakeTimers();
      holdConnect = true;
      const pending = manager.connect(config);
      await vi.waitFor(() => expect(pendingConnects).toHaveLength(1));

      await manager.close();
      pendingConnects[0]!();
      await pending;
      expect(log.lastIndexOf("disconnect 0")).toBeGreaterThan(log.indexOf("connected 0"));

      holdConnect = false;
      expect(await manager.connect(config)).toEqual({ status: "disconnected" });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(FakeObsClient.created).toHaveLength(1);
      expect(manager.status()).toEqual({ status: "disconnected" });
    });

    it("does not start a connection that was waiting for the old one to stop when closed", async () => {
      await manager.connect(config);
      holdDisconnect = true;

      const reconnecting = manager.connect(config);
      const closing = manager.close();
      for (const release of pendingDisconnects) release();
      await Promise.all([reconnecting, closing]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(FakeObsClient.created).toHaveLength(1);
      expect(manager.status()).toEqual({ status: "disconnected" });
    });
  });
});
