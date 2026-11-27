/**
 * Where a source sits in an OBS scene (a scene item's transform), in OBS's own units, and how a move from
 * one place to another is split into frames. Plain data and pure functions: nothing here talks to OBS.
 */

/** Farthest a source may be placed from the canvas origin, in pixels (OBS accepts a little more). */
export const MAX_OBS_POSITION = 90_000;
/** Largest scale multiplier of a source, either way (a negative scale flips it). */
export const MAX_OBS_SCALE = 100;
/** Largest rotation OBS accepts, in degrees, either way. */
export const MAX_OBS_ROTATION = 360;
/** Most pixels cropped from one side of a source. */
export const MAX_OBS_CROP = 100_000;
/** Largest side of a bounding box, in pixels; the smallest is 1. */
export const MAX_OBS_BOUNDS_SIZE = 90_000;
/** Longest animated move, in milliseconds; 0 moves at once. */
export const MAX_MOVE_DURATION_MS = 2000;
/** Frames an animated move sends to OBS each second. */
export const MOVE_STEPS_PER_SECOND = 30;

/** obs-websocket's name for "no bounding box". */
export const OBS_BOUNDS_NONE = "OBS_BOUNDS_NONE";
/** The kinds of bounding box obs-websocket names, other than none. */
export const OBS_BOUNDS_TYPES = [
  "OBS_BOUNDS_STRETCH",
  "OBS_BOUNDS_SCALE_INNER",
  "OBS_BOUNDS_SCALE_OUTER",
  "OBS_BOUNDS_SCALE_TO_WIDTH",
  "OBS_BOUNDS_SCALE_TO_HEIGHT",
  "OBS_BOUNDS_MAX_ONLY",
] as const;
export type ObsBoundsType = (typeof OBS_BOUNDS_TYPES)[number];

/** Pixels cut from each side of the source, before scaling. */
export interface ObsSourceCrop {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A bounding box: OBS sizes the source to it (how depends on `type`) instead of by its scale. */
export interface ObsSourceBounds {
  readonly type: ObsBoundsType;
  readonly width: number;
  readonly height: number;
}

/** The place and size of a source in a scene. */
export interface ObsSourceTransform {
  readonly positionX: number;
  readonly positionY: number;
  /** Multipliers of the source's own size (1 = 100 %). */
  readonly scaleX: number;
  readonly scaleY: number;
  /** Degrees, clockwise. */
  readonly rotation: number;
  readonly crop: ObsSourceCrop;
  /** Absent when the source has no bounding box. */
  readonly bounds?: ObsSourceBounds;
}

/** A transform as OBS reports it, with the source's own size (0 when OBS does not know it). */
export interface ObsSourceTransformReading extends ObsSourceTransform {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

/** The frames of a move, in order, and the time between them. The last frame is the target itself. */
export interface SourceMovePlan {
  readonly frames: readonly ObsSourceTransform[];
  readonly intervalMs: number;
}

/** Ease in and out (cubic): 0 at 0, 1 at 1, slow at both ends and never backwards. */
export function easeInOut(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** How many frames a move of `durationMs` takes: `MOVE_STEPS_PER_SECOND` of them a second, one when instant. */
export function moveStepCount(durationMs: number): number {
  if (!(durationMs > 0)) return 1;
  return Math.max(1, Math.round((durationMs / 1000) * MOVE_STEPS_PER_SECOND));
}

/**
 * Splits a move from where the source is (`from`) to `target` into evenly timed frames along an ease-in-out
 * curve. A bounding box on either end is animated too: one that only the target has grows from the size the
 * source shows now, and one that only the start has shrinks towards the target's size and goes on the last frame.
 */
export function planSourceMove(from: ObsSourceTransformReading, target: ObsSourceTransform, durationMs: number): SourceMovePlan {
  const count = moveStepCount(durationMs);
  if (count === 1) return { frames: [target], intervalMs: 0 };
  const boundsType = target.bounds?.type ?? from.bounds?.type;
  const boundsFrom = from.bounds ?? shownSize(from, from);
  const boundsTo = target.bounds ?? shownSize(target, from);
  const frames: ObsSourceTransform[] = [];
  for (let step = 1; step < count; step += 1) {
    const eased = easeInOut(step / count);
    const mix = (start: number, end: number) => start + (end - start) * eased;
    const frame: ObsSourceTransform = {
      positionX: mix(from.positionX, target.positionX),
      positionY: mix(from.positionY, target.positionY),
      scaleX: mix(from.scaleX, target.scaleX),
      scaleY: mix(from.scaleY, target.scaleY),
      rotation: mix(from.rotation, target.rotation),
      crop: {
        left: Math.round(mix(from.crop.left, target.crop.left)),
        top: Math.round(mix(from.crop.top, target.crop.top)),
        right: Math.round(mix(from.crop.right, target.crop.right)),
        bottom: Math.round(mix(from.crop.bottom, target.crop.bottom)),
      },
    };
    frames.push(
      boundsType ? { ...frame, bounds: { type: boundsType, width: Math.max(1, mix(boundsFrom.width, boundsTo.width)), height: Math.max(1, mix(boundsFrom.height, boundsTo.height)) } } : frame,
    );
  }
  frames.push(target);
  return { frames, intervalMs: durationMs / count };
}

/** The size a transform without a bounding box shows the source at: its cropped size times its scale, at least a pixel. */
function shownSize(transform: ObsSourceTransform, source: { sourceWidth: number; sourceHeight: number }): { width: number; height: number } {
  const { crop } = transform;
  return {
    width: Math.max(1, Math.abs(transform.scaleX) * Math.max(0, source.sourceWidth - crop.left - crop.right)),
    height: Math.max(1, Math.abs(transform.scaleY) * Math.max(0, source.sourceHeight - crop.top - crop.bottom)),
  };
}
