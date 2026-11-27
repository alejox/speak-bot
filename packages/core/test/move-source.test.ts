import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  ACTION_TYPES,
  easeInOut,
  InvalidBoardError,
  isActionAllowedOnBoard,
  isMultiActionStepType,
  KEY_ICON_IDS,
  makeBoard,
  MAX_MOVE_DURATION_MS,
  moveStepCount,
  parseAction,
  planSourceMove,
  type ObsSourceTransform,
  type ObsSourceTransformReading,
} from "../src/index";

const corner: ObsSourceTransform = { positionX: 1440, positionY: 810, scaleX: 0.25, scaleY: 0.25, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 } };
const move = (overrides: Record<string, unknown> = {}) => ({ type: "obs.moveSource", sceneName: "Main", sourceName: "Cam", transform: corner, durationMs: 0, ...overrides });
const withTransform = (overrides: Record<string, unknown>) => move({ transform: { ...corner, ...overrides } });

describe("the obs.moveSource action", () => {
  it("is an OBS action listed right after showing or hiding a source, with a scene and a source to pick", () => {
    const definition = ACTION_REGISTRY["obs.moveSource"];
    expect(definition).toMatchObject({ category: "obs", runsOn: "server", requiresObs: true, requiresDesktop: true, canSpan: false, userSelectable: true });
    expect(definition.params.map((param) => [param.name, param.kind])).toEqual([
      ["sceneName", "scene"],
      ["sourceName", "source"],
    ]);
    expect(KEY_ICON_IDS).toContain(definition.defaultIcon);
    expect(ACTION_TYPES[ACTION_TYPES.indexOf("obs.toggleSourceVisibility") + 1]).toBe("obs.moveSource");
  });

  it("belongs on Deck boards only and may be a step of a multi-action", () => {
    expect(isActionAllowedOnBoard("deck", "obs.moveSource")).toBe(true);
    expect(isActionAllowedOnBoard("voice", "obs.moveSource")).toBe(false);
    expect(() => makeBoard("a", "A", "voice", [{ slot: 1, action: parseAction(move()) }])).toThrow(InvalidBoardError);
    expect(isMultiActionStepType("obs.moveSource")).toBe(true);
    const sequence = { type: "system.multiAction", steps: [{ action: move() }, { action: move({ durationMs: 500 }), delayMs: 100 }] };
    expect(parseAction(sequence)).toEqual({
      type: "system.multiAction",
      steps: [
        { action: move(), delayMs: 0 },
        { action: move({ durationMs: 500 }), delayMs: 100 },
      ],
    });
  });

  it("keeps a valid target, drops unknown properties and moves at once when no time is given", () => {
    const { durationMs: _unused, ...withoutDuration } = move();
    expect(parseAction({ ...withoutDuration, extra: 1, transform: { ...corner, alignment: 5, crop: { ...corner.crop, extra: 1 } } })).toEqual(move());
    expect(parseAction(move({ durationMs: MAX_MOVE_DURATION_MS }))).toEqual(move({ durationMs: 2000 }));
    const bounded = withTransform({ scaleX: -1.5, rotation: -90, crop: { left: 10, top: 0, right: 20, bottom: 5 }, bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 1920, height: 1080, extra: 1 } });
    expect(parseAction(bounded)).toEqual(withTransform({ scaleX: -1.5, rotation: -90, crop: { left: 10, top: 0, right: 20, bottom: 5 }, bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 1920, height: 1080 } }));
  });

  it.each([
    move({ transform: undefined }),
    move({ transform: [] }),
    move({ sceneName: "" }),
    move({ sourceName: undefined }),
    move({ durationMs: -1 }),
    move({ durationMs: 2001 }),
    move({ durationMs: 10.5 }),
    move({ durationMs: "300" }),
    withTransform({ positionX: Number.NaN }),
    withTransform({ positionX: Number.POSITIVE_INFINITY }),
    withTransform({ positionY: "10" }),
    withTransform({ positionY: 90_001 }),
    withTransform({ positionX: -90_001 }),
    withTransform({ scaleX: 101 }),
    withTransform({ scaleY: -101 }),
    withTransform({ scaleY: undefined }),
    withTransform({ rotation: 361 }),
    withTransform({ rotation: -361 }),
    withTransform({ crop: undefined }),
    withTransform({ crop: { left: -1, top: 0, right: 0, bottom: 0 } }),
    withTransform({ crop: { left: 0.5, top: 0, right: 0, bottom: 0 } }),
    withTransform({ crop: { left: 0, top: 0, right: 100_001, bottom: 0 } }),
    withTransform({ crop: { left: 0, top: 0, right: 0 } }),
    withTransform({ bounds: { type: "OBS_BOUNDS_NONE", width: 100, height: 100 } }),
    withTransform({ bounds: { type: "OBS_BOUNDS_WHATEVER", width: 100, height: 100 } }),
    withTransform({ bounds: { type: "OBS_BOUNDS_STRETCH", width: 0, height: 100 } }),
    withTransform({ bounds: { type: "OBS_BOUNDS_STRETCH", width: 100, height: 90_001 } }),
    withTransform({ bounds: "OBS_BOUNDS_STRETCH" }),
  ])("rejects %j", (value) => {
    expect(() => parseAction(value)).toThrow(InvalidBoardError);
  });
});

describe("planning a move", () => {
  const full: ObsSourceTransformReading = { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 }, sourceWidth: 1920, sourceHeight: 1080 };

  it("eases in and out, from 0 to 1 and never backwards", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
    expect(easeInOut(0.75)).toBeGreaterThan(0.75);
    const samples = Array.from({ length: 101 }, (_, index) => easeInOut(index / 100));
    for (let index = 1; index < samples.length; index += 1) expect(samples[index]!).toBeGreaterThanOrEqual(samples[index - 1]!);
  });

  it("takes about 30 steps per second and a single step when instant", () => {
    expect(moveStepCount(0)).toBe(1);
    expect(moveStepCount(-5)).toBe(1);
    expect(moveStepCount(10)).toBe(1);
    expect(moveStepCount(300)).toBe(9);
    expect(moveStepCount(1000)).toBe(30);
    expect(moveStepCount(2000)).toBe(60);
  });

  it("jumps to the target in one frame when the time is zero", () => {
    expect(planSourceMove(full, corner, 0)).toEqual({ frames: [corner], intervalMs: 0 });
  });

  it("moves steadily from where the source is and ends exactly on the target", () => {
    const { frames, intervalMs } = planSourceMove(full, corner, 1000);
    expect(frames).toHaveLength(30);
    expect(intervalMs * frames.length).toBeCloseTo(1000);
    expect(frames.at(-1)).toEqual(corner);
    const xs = frames.map((frame) => frame.positionX);
    expect(xs[0]!).toBeGreaterThan(0);
    for (let index = 1; index < xs.length; index += 1) expect(xs[index]!).toBeGreaterThanOrEqual(xs[index - 1]!);
    // Half way through the time the eased move is half way there, in place and in size.
    expect(frames[14]).toMatchObject({ positionX: 720, positionY: 405, scaleX: 0.625, scaleY: 0.625 });
    for (const frame of frames) expect(frame.bounds).toBeUndefined();
  });

  it("moves the crop in whole pixels and the rotation with everything else", () => {
    const target: ObsSourceTransform = { ...corner, rotation: 90, crop: { left: 101, top: 0, right: 0, bottom: 51 } };
    const { frames } = planSourceMove(full, target, 300);
    for (const frame of frames) for (const side of Object.values(frame.crop)) expect(Number.isInteger(side)).toBe(true);
    expect(frames.at(-1)).toEqual(target);
    expect(frames[3]!.rotation).toBeGreaterThan(0);
    expect(frames[3]!.rotation).toBeLessThan(90);
  });

  it("grows a bounding box from the size the source has when only the target uses one", () => {
    const quarter: ObsSourceTransformReading = { ...full, scaleX: 0.25, scaleY: 0.25, crop: { left: 0, top: 0, right: 320, bottom: 0 } };
    const fit: ObsSourceTransform = { ...corner, positionX: 0, positionY: 0, bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 1920, height: 1080 } };
    const { frames } = planSourceMove(quarter, fit, 1000);
    expect(frames.at(-1)).toEqual(fit);
    expect(frames[0]!.bounds!.type).toBe("OBS_BOUNDS_SCALE_INNER");
    // (1920 - 320) * 0.25 = 400 wide and 270 tall at the start.
    expect(frames[0]!.bounds!.width).toBeGreaterThan(400);
    expect(frames[0]!.bounds!.width).toBeLessThan(410);
    expect(frames[0]!.bounds!.height).toBeGreaterThan(270);
    expect(frames[14]!.bounds).toEqual({ type: "OBS_BOUNDS_SCALE_INNER", width: 1160, height: 675 });
  });

  it("shrinks the bounding box it has towards the target's size and drops it on the last frame", () => {
    const fitted: ObsSourceTransformReading = { ...full, bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 1920, height: 1080 } };
    const { frames } = planSourceMove(fitted, corner, 1000);
    expect(frames.at(-1)).toEqual(corner);
    expect(frames.at(-1)!.bounds).toBeUndefined();
    expect(frames[14]!.bounds).toEqual({ type: "OBS_BOUNDS_SCALE_INNER", width: 1200, height: 675 });
    expect(frames.at(-2)!.bounds!.width).toBeGreaterThanOrEqual(480);
  });

  it("moves between two bounding boxes with the target's kind", () => {
    const fitted: ObsSourceTransformReading = { ...full, bounds: { type: "OBS_BOUNDS_STRETCH", width: 1920, height: 1080 } };
    const small: ObsSourceTransform = { ...corner, bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 480, height: 270 } };
    const { frames } = planSourceMove(fitted, small, 1000);
    expect(frames[14]!.bounds).toEqual({ type: "OBS_BOUNDS_SCALE_INNER", width: 1200, height: 675 });
    expect(frames.at(-1)).toEqual(small);
  });

  it("keeps a bounding box at least one pixel wide when the source size is unknown", () => {
    const unknown: ObsSourceTransformReading = { ...full, sourceWidth: 0, sourceHeight: 0 };
    const fit: ObsSourceTransform = { ...corner, bounds: { type: "OBS_BOUNDS_STRETCH", width: 100, height: 100 } };
    for (const frame of planSourceMove(unknown, fit, 300).frames) {
      expect(frame.bounds!.width).toBeGreaterThanOrEqual(1);
      expect(frame.bounds!.height).toBeGreaterThanOrEqual(1);
    }
  });
});
