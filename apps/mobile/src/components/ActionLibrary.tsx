import { ACTION_REGISTRY, ACTION_TYPES, allowedActionCategories, type ActionType, type BoardKind } from "@speed-deck/core";
import { useId, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import { KeyIcon } from "./KeyIcon";

/** Drag data type of an action dragged from the library. */
export const ACTION_DRAG_TYPE = "application/x-speed-deck-action";

interface ActionLibraryProps {
  /** Kind of the board being edited; only the actions it allows are offered. */
  boardKind: BoardKind;
  /** 0-based slot the "Assign" buttons target; null when no key is selected. */
  selectedSlot: number | null;
  onAssign: (type: ActionType) => void;
}

/** Every action the board's kind allows, grouped by category, with search. Drag one onto a key, or select a key and press "Assign". */
export function ActionLibrary({ boardKind, selectedSlot, onAssign }: ActionLibraryProps) {
  const t = useT();
  const headingId = useId();
  const searchId = useId();
  const hintId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const name = (type: ActionType) => t(ACTION_REGISTRY[type].labelKey as MessageKey);
  const description = (type: ActionType) => t(ACTION_REGISTRY[type].descriptionKey as MessageKey);
  const matches = (type: ActionType) =>
    needle === "" || `${name(type)} ${description(type)} ${t(`category.${ACTION_REGISTRY[type].category}`)}`.toLocaleLowerCase().includes(needle);
  const groups = allowedActionCategories(boardKind).map((category) => ({
    category,
    types: ACTION_TYPES.filter((type) => ACTION_REGISTRY[type].category === category && matches(type)),
  })).filter((group) => group.types.length > 0);

  return (
    <section className="action-library" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("library.title")}</h3>
      <label htmlFor={searchId} className="visually-hidden">
        {t("library.search")}
      </label>
      <input
        id={searchId}
        type="search"
        className="library-search"
        placeholder={t("library.search")}
        value={query}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      {selectedSlot === null && (
        <p id={hintId} className="field-hint">
          {t("library.selectKeyFirst")}
        </p>
      )}
      {groups.length === 0 && <p className="empty">{t("library.noResults")}</p>}
      {groups.map(({ category, types }) => (
        <section key={category} className="library-group" aria-label={t(`category.${category}`)}>
          <h4>{t(`category.${category}`)}</h4>
          <ul>
            {types.map((type) => (
              <li
                key={type}
                className="library-item"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(ACTION_DRAG_TYPE, type);
                  event.dataTransfer.effectAllowed = "copy";
                }}
              >
                <KeyIcon id={ACTION_REGISTRY[type].defaultIcon} size={20} />
                <span className="library-text">
                  <span className="library-name">{name(type)}</span>
                  <span className="library-description">{description(type)}</span>
                </span>
                <button
                  type="button"
                  className="button button-small"
                  aria-label={selectedSlot === null ? undefined : t("library.assignTo", { action: name(type), number: selectedSlot + 1 })}
                  aria-disabled={selectedSlot === null || undefined}
                  aria-describedby={selectedSlot === null ? hintId : undefined}
                  onClick={() => selectedSlot !== null && onAssign(type)}
                >
                  {t("library.assign")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
