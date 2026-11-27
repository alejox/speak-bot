import { MAX_MOVE_DURATION_MS } from "@speed-deck/core";
import { useEffect, useId, useRef, useState } from "react";
import type { ObsServices } from "../app/composition-root";
import { captureProblem, hasMoveTarget, keepsPlacement, MOVE_CAPTURE_FIELD, MOVE_DURATION_FIELD, MOVE_NUMBER_FIELDS, moveTargetValues } from "../app/move-source-draft";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";

interface MoveSourceFieldsProps {
  /** The draft's parameter values: the scene and source chosen above, and the target (see `move-source-draft`). */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  /** Reads where the source is; null in phone-only mode. */
  obs: ObsServices | null;
  invalidField?: string;
  fieldOf: (name: string) => string;
}

type Capture = { state: "idle" } | { state: "reading" } | { state: "read" } | { state: "failed"; reason: MessageKey };

/**
 * Where a "move source" key takes its source: a button reads the place the source has in OBS right now, and the
 * numbers it fills in stay editable. Below them, how long the move takes.
 */
export function MoveSourceFields({ values, onChange, obs, invalidField, fieldOf }: MoveSourceFieldsProps) {
  const t = useT();
  const ids = useId();
  const [capture, setCapture] = useState<Capture>({ state: "idle" });
  // The answer from OBS arrives later: it fills in the values as they are then, if the same source is still chosen.
  const latest = useRef({ values, onChange });
  latest.current = { values, onChange };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const sceneName = values.sceneName ?? "";
  const sourceName = values.sourceName ?? "";
  const chosen = sceneName.trim() !== "" && sourceName.trim() !== "";
  const hasTarget = hasMoveTarget(values);

  const read = () => {
    if (!obs) return setCapture({ state: "failed", reason: "editor.moveCaptureNoObs" });
    setCapture({ state: "reading" });
    const stillChosen = () => mounted.current && latest.current.values.sceneName === sceneName && latest.current.values.sourceName === sourceName;
    obs.getSourceTransform(sceneName, sourceName).then(
      (transform) => {
        if (!stillChosen()) return;
        latest.current.onChange({ ...latest.current.values, ...moveTargetValues(transform) });
        setCapture({ state: "read" });
      },
      (error: unknown) => {
        if (stillChosen()) setCapture({ state: "failed", reason: captureProblem(error) });
      },
    );
  };

  const hintId = `${ids}-hint`;
  return (
    <>
      <div className="field">
        <button
          type="button"
          className="button button-small"
          data-param={fieldOf(MOVE_CAPTURE_FIELD)}
          disabled={!chosen || capture.state === "reading"}
          aria-describedby={hintId}
          onClick={read}
        >
          {t("editor.moveCapture")}
        </button>
        <p id={hintId} className="field-hint">
          {!chosen ? t("editor.moveChooseFirst") : hasTarget ? t("editor.moveCaptureHint") : t("editor.moveNoTarget")}
        </p>
        {capture.state === "read" && (
          <p role="status" className="field-hint">
            {t("editor.moveCaptured")}
          </p>
        )}
        {capture.state === "failed" && (
          <p role="alert" className="field-error">
            {t(capture.reason)}
          </p>
        )}
      </div>

      {hasTarget &&
        MOVE_NUMBER_FIELDS.map((field) => {
          const id = `${ids}-${field.name}`;
          return (
            <div key={field.name} className="field">
              <label htmlFor={id}>{t(field.labelKey)}</label>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                step="any"
                min={-field.limit}
                max={field.limit}
                data-param={fieldOf(field.name)}
                aria-invalid={invalidField === fieldOf(field.name) || undefined}
                value={values[field.name] ?? ""}
                onChange={(event) => onChange({ ...values, [field.name]: event.target.value })}
              />
            </div>
          );
        })}
      {hasTarget && keepsPlacement(values) && <p className="field-hint">{t("editor.moveKeepsPlacement")}</p>}

      <div className="field">
        <label htmlFor={`${ids}-duration`}>{t("editor.moveDuration")}</label>
        <input
          id={`${ids}-duration`}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_MOVE_DURATION_MS}
          step={50}
          placeholder="0"
          data-param={fieldOf(MOVE_DURATION_FIELD)}
          aria-invalid={invalidField === fieldOf(MOVE_DURATION_FIELD) || undefined}
          aria-describedby={`${ids}-duration-hint`}
          value={values[MOVE_DURATION_FIELD] ?? ""}
          onChange={(event) => onChange({ ...values, [MOVE_DURATION_FIELD]: event.target.value })}
        />
        <p id={`${ids}-duration-hint`} className="field-hint">
          {t("editor.moveDurationHint", { max: MAX_MOVE_DURATION_MS })}
        </p>
      </div>
    </>
  );
}
