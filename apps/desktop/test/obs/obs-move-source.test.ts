import { ObsRequestError, ObsUnavailableError, type ObsSourceTransform } from "@speed-deck/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObsConnectionManager } from "../../src/adapters/obs/obs-connection-manager";
import { FakeObsClient, fullScreenTransform, obsResponses } from "../fake-obs-client";

const config = { host: "127.0.0.1", port: 4455, password: "" };
const corner: ObsSourceTransform = { positionX: 1440, positionY: 810, scaleX: 0.25, scaleY: 0.25, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 } };
/** What `corner` looks like as an obs-websocket transform update. */
const cornerUpdate = { positionX: 1440, positionY: 810, scaleX: 0.25, scaleY: 0.25, rotation: 0, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, boundsType: "OBS_BOUNDS_NONE" };

describe("moving a source in OBS", () => {
  let manager: ObsConnectionManager;
  let client: FakeObsClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    FakeObsClient.created = [];
    manager = new ObsConnectionManager({ createClient: () => new FakeObsClient(null, obsResponses()) });
    await manager.connect(config);
    client = FakeObsClient.created[0]!;
    client.calls.length = 0;
  });

  afterEach(async () => {
    await manager.disconnect();
    vi.useRealTimers();
  });

  const sets = () => client.calls.filter((call) => call.type === "SetSceneItemTransform").map((call) => call.data!.sceneItemTransform as Record<string, number | string>);
  /** Starts a move and notes how it ended, so a test can let timers run before looking. */
  const start = (target: ObsSourceTransform, durationMs: number, sourceName = "Cam") => {
    const outcome: { done: boolean; error?: unknown } = { done: false };
    void manager.moveSource("Main", sourceName, target, durationMs).then(
      () => (outcome.done = true),
      (error: unknown) => Object.assign(outcome, { done: true, error }),
    );
    return outcome;
  };

  it("reads where a source is, in the action's own shape", async () => {
    client.responses.GetSceneItemTransform = () => ({
      sceneItemTransform: { ...fullScreenTransform(), positionX: 12.5, scaleX: 0.5, rotation: 45, cropLeft: 10, cropBottom: 4, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: 640, boundsHeight: 360 },
    });
    expect(await manager.getSourceTransform("Main", "Cam")).toEqual({
      positionX: 12.5,
      positionY: 0,
      scaleX: 0.5,
      scaleY: 1,
      rotation: 45,
      crop: { left: 10, top: 0, right: 0, bottom: 4 },
      bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 640, height: 360 },
    });
    expect(client.calls).toEqual([
      { type: "GetSceneItemId", data: { sceneName: "Main", sourceName: "Cam" } },
      { type: "GetSceneItemTransform", data: { sceneName: "Main", sceneItemId: 3 } },
    ]);
  });

  it("leaves out the bounding box of a source that has none, and refuses a transform it cannot read", async () => {
    expect(await manager.getSourceTransform("Main", "Cam")).toEqual({ positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 } });
    client.responses.GetSceneItemTransform = () => ({ sceneItemTransform: { positionX: "left" } });
    await expect(manager.getSourceTransform("Main", "Cam")).rejects.toThrow(ObsRequestError);
  });

  it("moves at once with a single request when no time is asked", async () => {
    await manager.moveSource("Main", "Cam", corner, 0);
    expect(client.calls).toEqual([
      { type: "GetSceneItemId", data: { sceneName: "Main", sourceName: "Cam" } },
      { type: "SetSceneItemTransform", data: { sceneName: "Main", sceneItemId: 3, sceneItemTransform: cornerUpdate } },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends a bounding box with its size, and none when the target has none", async () => {
    await manager.moveSource("Main", "Cam", { ...corner, crop: { left: 1, top: 2, right: 3, bottom: 4 }, bounds: { type: "OBS_BOUNDS_STRETCH", width: 640, height: 360 } }, 0);
    expect(sets()[0]).toEqual({ ...cornerUpdate, cropLeft: 1, cropTop: 2, cropRight: 3, cropBottom: 4, boundsType: "OBS_BOUNDS_STRETCH", boundsWidth: 640, boundsHeight: 360 });
  });

  it("animates from where the source is, one frame every 30th of a second, and ends on the target", async () => {
    const outcome = start(corner, 300);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.calls.map((call) => call.type)).toEqual(["GetSceneItemId", "GetSceneItemTransform"]);
    await vi.advanceTimersByTimeAsync(33);
    expect(sets()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(sets()).toHaveLength(1);
    expect(outcome.done).toBe(false);
    await vi.advanceTimersByTimeAsync(300);

    expect(outcome).toEqual({ done: true });
    const frames = sets();
    expect(frames).toHaveLength(9);
    expect(frames.at(-1)).toEqual(cornerUpdate);
    const xs = frames.map((frame) => frame.positionX as number);
    expect(xs[0]!).toBeGreaterThan(0);
    for (let index = 1; index < xs.length; index += 1) expect(xs[index]!).toBeGreaterThan(xs[index - 1]!);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops a running move when the same source is moved again, and starts from where it got to", async () => {
    const first = start(corner, 1000);
    await vi.advanceTimersByTimeAsync(500);
    const reached = sets().at(-1)!;
    expect(reached.positionX as number).toBeGreaterThan(0);
    expect(reached.positionX as number).toBeLessThan(1440);
    const sent = sets().length;

    const back: ObsSourceTransform = { ...corner, positionX: 0, positionY: 0, scaleX: 1, scaleY: 1 };
    const second = start(back, 300);
    await vi.advanceTimersByTimeAsync(0);
    // The first press ends quietly: it was replaced, not failed.
    expect(first).toEqual({ done: true });
    await vi.advanceTimersByTimeAsync(300);

    expect(second).toEqual({ done: true });
    const after = sets().slice(sent);
    expect(after).toHaveLength(9);
    expect(after[0]!.positionX as number).toBeLessThanOrEqual(reached.positionX as number);
    expect(after.at(-1)).toMatchObject({ positionX: 0, positionY: 0, scaleX: 1, scaleY: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops a running move when an instant move of the same source arrives", async () => {
    const first = start(corner, 1000);
    await vi.advanceTimersByTimeAsync(200);
    const back: ObsSourceTransform = { ...corner, positionX: 0, positionY: 0 };
    await manager.moveSource("Main", "Cam", back, 0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(first).toEqual({ done: true });
    expect(sets().at(-1)).toMatchObject({ positionX: 0, positionY: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops and reports it when OBS refuses a frame midway", async () => {
    let frames = 0;
    client.responses.SetSceneItemTransform = () => {
      frames += 1;
      if (frames === 3) throw new Error("The scene item is locked.");
      return undefined;
    };
    const outcome = start(corner, 1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(outcome.error).toBeInstanceOf(ObsRequestError);
    expect((outcome.error as Error).message).toBe("The scene item is locked.");
    expect(frames).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops and reports OBS as unavailable when the connection is lost midway", async () => {
    const outcome = start(corner, 1000);
    await vi.advanceTimersByTimeAsync(200);
    const sent = sets().length;
    await manager.disconnect();
    await vi.advanceTimersByTimeAsync(2000);
    expect(outcome.error).toBeInstanceOf(ObsUnavailableError);
    expect(sets()).toHaveLength(sent);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops a running move when OBS closes the connection", async () => {
    const outcome = start(corner, 1000);
    await vi.advanceTimersByTimeAsync(200);
    const sent = sets().length;
    client.emit("ConnectionClosed", { code: 1006, message: "gone" });
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.error).toBeInstanceOf(ObsUnavailableError);
    expect(sets()).toHaveLength(sent);
  });

  it("reports a scene or source OBS does not have, and needs a connection", async () => {
    client.responses.GetSceneItemId = () => {
      throw new Error("No scene items were found in the specified scene by that name or offset.");
    };
    await expect(manager.moveSource("Main", "Gone", corner, 300)).rejects.toThrow(ObsRequestError);
    await expect(manager.getSourceTransform("Gone", "Cam")).rejects.toThrow(ObsRequestError);
    expect(sets()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    await manager.disconnect();
    await expect(manager.moveSource("Main", "Cam", corner, 0)).rejects.toThrow(ObsUnavailableError);
    await expect(manager.getSourceTransform("Main", "Cam")).rejects.toThrow(ObsUnavailableError);
  });
});
