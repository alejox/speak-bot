import { ACTION_REGISTRY, type ActionParamDefinition, type ActionType, type Board } from "@speed-deck/core";
import { useEffect, useId, useState } from "react";
import type { ObsServices } from "../app/composition-root";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";

interface ActionParamsFieldsProps {
  actionType: ActionType;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  boards: readonly Board[];
  /** Lists OBS scenes, inputs and sources; null in phone-only mode. */
  obs: ObsServices | null;
  /** Name of the parameter with an error, to mark it invalid and focus it. */
  invalidField?: string;
}

/** One field per action parameter, from the registry: text, number, or a pick list of OBS names or boards. */
export function ActionParamsFields({ actionType, values, onChange, boards, obs, invalidField }: ActionParamsFieldsProps) {
  const { params } = ACTION_REGISTRY[actionType];
  const lists = useObsLists(params, obs, values.sceneName ?? "");
  return (
    <>
      {params.map((param) => (
        <ParamField
          key={param.name}
          param={param}
          value={values[param.name] ?? ""}
          invalid={invalidField === param.name}
          options={optionsFor(param, lists, boards)}
          onChange={(value) => {
            const next = { ...values, [param.name]: value };
            // The source list belongs to the chosen scene.
            if (param.name === "sceneName" && "sourceName" in values) next.sourceName = "";
            onChange(next);
          }}
        />
      ))}
    </>
  );
}

interface Option {
  value: string;
  label: string;
}

/** OBS lists, or null for a list OBS could not give (not connected): the field is then free text. */
interface ObsLists {
  scenes: string[] | null;
  inputs: string[] | null;
  sources: string[] | null;
}

function useObsLists(params: readonly ActionParamDefinition[], obs: ObsServices | null, sceneName: string): ObsLists {
  const kinds = new Set(params.map((param) => param.kind));
  const needsScenes = kinds.has("scene");
  const needsInputs = kinds.has("input");
  const needsSources = kinds.has("source");
  const [lists, setLists] = useState<ObsLists>({ scenes: null, inputs: null, sources: null });

  useEffect(() => {
    if (!obs) return;
    let active = true;
    if (needsScenes) obs.listScenes().then((scenes) => active && setLists((current) => ({ ...current, scenes })), () => {});
    if (needsInputs) {
      obs.listInputs().then(
        (inputs) => active && setLists((current) => ({ ...current, inputs: inputs.map((input) => input.name) })),
        () => {},
      );
    }
    return () => {
      active = false;
    };
  }, [obs, needsScenes, needsInputs]);

  useEffect(() => {
    setLists((current) => ({ ...current, sources: null }));
    if (!obs || !needsSources || sceneName.trim() === "") return;
    let active = true;
    obs.listSceneItems(sceneName).then(
      (items) => active && setLists((current) => ({ ...current, sources: items.map((item) => item.sourceName) })),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [obs, needsSources, sceneName]);

  return lists;
}

function optionsFor(param: ActionParamDefinition, lists: ObsLists, boards: readonly Board[]): Option[] | null {
  const names = (list: string[] | null) => list?.map((name) => ({ value: name, label: name })) ?? null;
  switch (param.kind) {
    case "board":
      return boards.map((board) => ({ value: board.id, label: board.name }));
    case "scene":
      return names(lists.scenes);
    case "input":
      return names(lists.inputs);
    case "source":
      return names(lists.sources);
    default:
      return null;
  }
}

interface ParamFieldProps {
  param: ActionParamDefinition;
  value: string;
  invalid: boolean;
  /** Pick list; null for free input. */
  options: Option[] | null;
  onChange: (value: string) => void;
}

function ParamField({ param, value, invalid, options, onChange }: ParamFieldProps) {
  const t = useT();
  const id = useId();
  const hintId = useId();
  const label = t(param.labelKey as MessageKey);
  const isObsName = param.kind === "scene" || param.kind === "input" || param.kind === "source";
  const common = { id, "aria-invalid": invalid || undefined, "data-param": param.name };

  let control;
  if (options) {
    // Keep a saved value that is not in the list (e.g. a scene renamed in OBS) selectable.
    const all = value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options;
    control = (
      <select {...common} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("editor.choose")}</option>
        {all.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (param.kind === "text") {
    control = <textarea {...common} rows={3} maxLength={param.maxLength} value={value} onChange={(event) => onChange(event.target.value)} />;
  } else if (param.kind === "number") {
    control = (
      <input {...common} type="number" inputMode="numeric" min={param.min} max={param.max} step={1} value={value} onChange={(event) => onChange(event.target.value)} />
    );
  } else {
    control = (
      <input
        {...common}
        maxLength={param.maxLength}
        autoComplete="off"
        value={value}
        aria-describedby={isObsName ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {isObsName && !options && (
        <p id={hintId} className="field-hint">
          {t("editor.obsListUnavailable")}
        </p>
      )}
    </div>
  );
}
