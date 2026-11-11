import { ACTION_REGISTRY, ACTION_TYPES, allowedActionCategories, type ActionType, type BoardKind } from "@speed-deck/core";
import { useId } from "react";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import { KeyIcon } from "./KeyIcon";

interface ActionPickerProps {
  /** Kind of the board the key goes on; only the actions it allows are offered. */
  boardKind: BoardKind;
  query: string;
  onQueryChange: (query: string) => void;
  /** The action to focus first (the one chosen before going back), else the first one. */
  focusType?: ActionType;
  onPick: (type: ActionType) => void;
}

/** Every action the board's kind allows as a grid of tiles, grouped by category, with search. */
export function ActionPicker({ boardKind, query, onQueryChange, focusType, onPick }: ActionPickerProps) {
  const t = useT();
  const searchId = useId();
  const needle = query.trim().toLocaleLowerCase();
  const name = (type: ActionType) => t(ACTION_REGISTRY[type].labelKey as MessageKey);
  const description = (type: ActionType) => t(ACTION_REGISTRY[type].descriptionKey as MessageKey);
  const matches = (type: ActionType) =>
    needle === "" || `${name(type)} ${description(type)} ${t(`category.${ACTION_REGISTRY[type].category}`)}`.toLocaleLowerCase().includes(needle);
  const groups = allowedActionCategories(boardKind)
    .map((category) => ({ category, types: ACTION_TYPES.filter((type) => ACTION_REGISTRY[type].userSelectable && ACTION_REGISTRY[type].category === category && matches(type)) }))
    .filter((group) => group.types.length > 0);
  const offered = groups.flatMap((group) => group.types);
  const focused = focusType && offered.includes(focusType) ? focusType : offered[0];

  return (
    <div className="action-picker">
      <label htmlFor={searchId} className="visually-hidden">
        {t("library.search")}
      </label>
      <input
        id={searchId}
        type="search"
        className="action-picker-search"
        placeholder={t("library.search")}
        value={query}
        autoComplete="off"
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {groups.length === 0 && <p className="empty">{t("library.noResults")}</p>}
      {groups.map(({ category, types }) => (
        <section key={category} className="action-picker-group" aria-label={t(`category.${category}`)}>
          <h3 className="action-picker-heading" aria-hidden="true">
            {t(`category.${category}`)}
          </h3>
          <ul className="action-picker-grid">
            {types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  className="action-tile"
                  title={description(type)}
                  data-autofocus={type === focused ? true : undefined}
                  onClick={() => onPick(type)}
                >
                  <KeyIcon id={ACTION_REGISTRY[type].defaultIcon} size={24} />
                  <span className="action-tile-name">{name(type)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
