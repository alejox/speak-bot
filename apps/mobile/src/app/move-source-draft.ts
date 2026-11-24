import {
  MAX_MOVE_DURATION_MS,
  MAX_OBS_POSITION,
  MAX_OBS_ROTATION,
  MAX_OBS_SCALE,
  type ApiErrorCode,
  type ObsSourceBounds,
  type ObsSourceCrop,
  type ObsSourceTransform,
} from "@speed-deck/core";
import { DesktopRequestError } from "../adapters/desktop-api";
import type { Message, MessageKey } from "../i18n/messages";

/**
 * The target of a "move source" key while it is edited. Like every other field of a key draft it is text, kept in
 * the draft's parameter values: the numbers the editor shows, plus `placement` for what it does not (crop and
 * bounding box), which travels as it was captured.
 */
export const MOVE_NUMBER_FIELDS = [
  { name: "positionX", labelKey: "editor.movePositionX", limit: MAX_OBS_POSITION, factor: 1 },
  { name: "positionY", labelKey: "editor.movePositionY", limit: MAX_OBS_POSITION, factor: 1 },
  // Scale is shown as a percentage and kept as OBS's multiplier.
  { name: "scaleX", labelKey: "editor.moveScaleX", limit: MAX_OBS_SCALE * 100, factor: 100 },
  { name: "scaleY", labelKey: "editor.moveScaleY", limit: MAX_OBS_SCALE * 100, factor: 100 },
  { name: "rotation", labelKey: "editor.moveRotation", limit: MAX_OBS_ROTATION, factor: 1 },
] as const satisfies readonly { name: keyof ObsSourceTransform; labelKey: MessageKey; limit: number; factor: number }[];

/** The field id the editor gives the capture button, to point at it when no target was captured. */
export const MOVE_CAPTURE_FIELD = "capture";
export const MOVE_DURATION_FIELD = "durationMs";
const PLACEMENT_FIELD = "placement";

interface Placement {
  crop: ObsSourceCrop;
  bounds?: ObsSourceBounds;
}

/** A number as the editor shows it: at most four decimals, without trailing zeros. */
function shown(value: number): string {
  return String(Math.round(value * 1e4) / 1e4);
}

/** The draft values of a target: what a capture fills in, and what an existing key starts with. */
export function moveTargetValues(transform: ObsSourceTransform): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of MOVE_NUMBER_FIELDS) values[field.name] = shown(transform[field.name] * field.factor);
  const placement: Placement = { crop: transform.crop, ...(transform.bounds ? { bounds: transform.bounds } : {}) };
  values[PLACEMENT_FIELD] = JSON.stringify(placement);
  return values;
}

/** The draft value of an animation time; instant is shown as an empty field. */
export function moveDurationValue(durationMs: number): string {
  return durationMs === 0 ? "" : String(durationMs);
}

function placementOf(values: Record<string, string>): Placement | null {
  try {
    const placement = JSON.parse(values[PLACEMENT_FIELD] ?? "") as Placement | null;
    return typeof placement === "object" && placement !== null && typeof placement.crop === "object" ? placement : null;
  } catch {
    return null;
  }
}

/** Whether the draft has a target: one was captured, or the key already had one. */
export function hasMoveTarget(values: Record<string, string>): boolean {
  return placementOf(values) !== null;
}

/** Whether the target restores a crop or a bounding box, which the editor mentions but does not show. */
export function keepsPlacement(values: Record<string, string>): boolean {
  const placement = placementOf(values);
  return placement !== null && (placement.bounds !== undefined || Object.values(placement.crop).some((side) => side !== 0));
}

type MoveProblem = { ok: false; error: Message; field: string };

/** The unchecked `transform` and `durationMs` of a move from the typed values, or the first problem with them. */
export function rawMoveTarget(
  values: Record<string, string>,
  t: (key: MessageKey) => string,
  fieldOf: (name: string) => string,
): { ok: true; value: { transform: Record<string, unknown>; durationMs: number } } | MoveProblem {
  const placement = placementOf(values);
  if (!placement) return { ok: false, error: { key: "editor.moveTargetRequired" }, field: fieldOf(MOVE_CAPTURE_FIELD) };
  const transform: Record<string, unknown> = { ...placement };
  for (const { name, labelKey, limit, factor } of MOVE_NUMBER_FIELDS) {
    const text = (values[name] ?? "").trim();
    const field = t(labelKey);
    if (text === "") return { ok: false, error: { key: "editor.paramRequired", params: { field } }, field: fieldOf(name) };
    const number = Number(text.replace(",", "."));
    if (!Number.isFinite(number) || Math.abs(number) > limit) {
      return { ok: false, error: { key: "editor.numberBetween", params: { field, min: -limit, max: limit } }, field: fieldOf(name) };
    }
    transform[name] = number / factor;
  }
  const time = (values[MOVE_DURATION_FIELD] ?? "").trim();
  const durationMs = time === "" ? 0 : Number(time);
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > MAX_MOVE_DURATION_MS) {
    return { ok: false, error: { key: "editor.numberRange", params: { field: t("editor.moveDuration"), min: 0, max: MAX_MOVE_DURATION_MS } }, field: fieldOf(MOVE_DURATION_FIELD) };
  }
  return { ok: true, value: { transform, durationMs } };
}

const NO_OBS_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["obs-unavailable", "obs-disabled"]);

/** Why the source's position could not be read: OBS is not there, it has no such scene or source, or something else. */
export function captureProblem(error: unknown): MessageKey {
  const code = error instanceof DesktopRequestError ? error.code : undefined;
  if (code && NO_OBS_CODES.has(code)) return "editor.moveCaptureNoObs";
  return code === "obs-request-failed" ? "editor.moveCaptureMissing" : "editor.moveCaptureFailed";
}
