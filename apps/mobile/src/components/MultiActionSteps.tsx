import {
  ACTION_REGISTRY,
  ACTION_TYPES,
  allowedActionCategories,
  isActionAllowedOnBoard,
  isMultiActionStepType,
  MAX_MULTI_ACTION_STEPS,
  MAX_STEP_DELAY_MS,
  type ActionType,
  type Application,
  type Board,
  type BoardKind,
} from "@speed-deck/core";
import { useId } from "react";
import type { ObsServices } from "../app/composition-root";
import { emptyStep, stepField, type StepDraft } from "../app/key-draft";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import { ActionParamsFields } from "./ActionParamsFields";

interface MultiActionStepsProps {
  steps: readonly StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  /** Kind of the board the key is on; a step may be any action it allows that the desktop runs on a press. */
  boardKind: BoardKind;
  boards: readonly Board[];
  obs: ObsServices | null;
  listApplications?: (() => Promise<Application[]>) | null;
  /** The field with an error (see `stepField`), to mark it invalid. */
  invalidField?: string;
}

/** The steps of a multi-action in order: each one's action, its details and the wait before it; add, reorder and remove. */
export function MultiActionSteps({ steps, onChange, boardKind, boards, obs, listApplications, invalidField }: MultiActionStepsProps) {
  const t = useT();
  const prefix = useId();
  const offered = (type: ActionType) => ACTION_REGISTRY[type].userSelectable && isMultiActionStepType(type) && isActionAllowedOnBoard(boardKind, type);
  const categories = allowedActionCategories(boardKind).filter((category) => ACTION_TYPES.some((type) => offered(type) && ACTION_REGISTRY[type].category === category));

  const change = (index: number, patch: Partial<StepDraft>) => onChange(steps.map((step, at) => (at === index ? { ...step, ...patch } : step)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    onChange(next);
  };

  return (
    <fieldset className="steps" data-param="steps">
      <legend>{t("editor.steps")}</legend>
      <ol className="steps-list">
        {steps.map((step, index) => {
          const number = index + 1;
          const actionId = `${prefix}-action-${index}`;
          const delayId = `${prefix}-delay-${index}`;
          return (
            <li key={index} className="step">
              <fieldset className="step-fields">
                <legend>{t("editor.step", { number })}</legend>
                <div className="field">
                  <label htmlFor={actionId}>{t("editor.action")}</label>
                  <select
                    id={actionId}
                    data-param={stepField(index, "action")}
                    value={step.actionType}
                    aria-invalid={invalidField === stepField(index, "action") || undefined}
                    onChange={(event) => change(index, { actionType: event.target.value as ActionType | "", params: {} })}
                  >
                    <option value="">{t("editor.chooseAction")}</option>
                    {categories.map((category) => (
                      <optgroup key={category} label={t(`category.${category}`)}>
                        {ACTION_TYPES.filter((type) => offered(type) && ACTION_REGISTRY[type].category === category).map((type) => (
                          <option key={type} value={type}>
                            {t(ACTION_REGISTRY[type].labelKey as MessageKey)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {step.actionType && (
                  <ActionParamsFields
                    actionType={step.actionType}
                    values={step.params}
                    onChange={(params) => change(index, { params })}
                    boards={boards}
                    obs={obs}
                    listApplications={listApplications}
                    invalidField={invalidField}
                    fieldOf={(name) => stepField(index, name)}
                  />
                )}
                <div className="field field-inline">
                  <label htmlFor={delayId}>{t("editor.stepDelay")}</label>
                  <input
                    id={delayId}
                    data-param={stepField(index, "delay")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_STEP_DELAY_MS / 1000}
                    step={0.1}
                    placeholder="0"
                    value={step.delay}
                    aria-invalid={invalidField === stepField(index, "delay") || undefined}
                    onChange={(event) => change(index, { delay: event.target.value })}
                  />
                </div>
                <div className="step-actions">
                  <button type="button" className="button button-small button-quiet" onClick={() => move(index, -1)} disabled={index === 0}>
                    {t("editor.moveStepUp")}
                  </button>
                  <button type="button" className="button button-small button-quiet" onClick={() => move(index, 1)} disabled={index === steps.length - 1}>
                    {t("editor.moveStepDown")}
                  </button>
                  <button type="button" className="button button-small button-quiet" onClick={() => onChange(steps.filter((_, at) => at !== index))}>
                    {t("editor.removeStep")}
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <button type="button" className="button button-small" onClick={() => onChange([...steps, emptyStep()])} disabled={steps.length >= MAX_MULTI_ACTION_STEPS}>
        {t("editor.addStep")}
      </button>
    </fieldset>
  );
}
