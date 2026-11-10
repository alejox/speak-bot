import { Check } from "lucide-react";
import { Fragment, useEffect, useId, useRef, type KeyboardEvent, type RefObject } from "react";

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Shown but not chosen; `description` says why. */
  disabled?: boolean;
  description?: string;
  /** A choice among several (menuitemradio): whether it is the current one. */
  checked?: boolean;
}

/** Items shown together, with a separator before the next group; named when `label` is set. */
export interface MenuGroup {
  label?: string;
  items: readonly MenuItem[];
}

interface MenuProps {
  /** The menu's accessible name. */
  label: string;
  /** One group, or `groups` for several. */
  items?: readonly MenuItem[];
  groups?: readonly MenuGroup[];
  /** Escape or Tab: close the menu and send focus back to what opened it. */
  onClose: () => void;
}

/**
 * A menu of plain-text items (WAI-ARIA menu pattern): the first item takes focus, the arrow keys, Home and End
 * move through the items, Escape and Tab close it.
 */
export function Menu({ label, items = [], groups, onClose }: MenuProps) {
  const descriptionPrefix = useId();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The current choice, when there is one, else the first item.
    const first = container.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? container.current?.querySelector<HTMLElement>(ITEM_SELECTOR);
    first?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const elements = Array.from(container.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const index = elements.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % elements.length
        : event.key === "ArrowUp"
          ? (index - 1 + elements.length) % elements.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? elements.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    elements[next]?.focus();
  };

  const renderItem = (item: MenuItem, key: string) => {
    const descriptionId = `${descriptionPrefix}-${key}`;
    return (
      <button
        key={key}
        type="button"
        role={item.checked === undefined ? "menuitem" : "menuitemradio"}
        aria-checked={item.checked}
        className="menu-item"
        tabIndex={-1}
        aria-disabled={item.disabled || undefined}
        aria-describedby={item.description ? descriptionId : undefined}
        title={item.description}
        onClick={() => !item.disabled && item.onSelect()}
      >
        <span className="menu-item-label">{item.label}</span>
        {item.checked && <Check size={16} aria-hidden="true" />}
        {item.description && (
          <span id={descriptionId} hidden>
            {item.description}
          </span>
        )}
      </button>
    );
  };

  const all = groups ?? [{ items }];
  return (
    <div ref={container} role="menu" aria-label={label} className="menu" onKeyDown={handleKeyDown}>
      {all.map((group, groupIndex) => (
        <Fragment key={group.label ?? groupIndex}>
          {groupIndex > 0 && <div role="separator" className="menu-separator" />}
          {group.label ? (
            <div role="group" aria-label={group.label} className="menu-group">
              <div className="menu-group-label" aria-hidden="true">
                {group.label}
              </div>
              {group.items.map((item, index) => renderItem(item, `${groupIndex}-${index}`))}
            </div>
          ) : (
            group.items.map((item, index) => renderItem(item, `${groupIndex}-${index}`))
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** Calls `onOutside` when a press lands outside `ref` (closing a menu without moving focus). */
export function useOutsidePress(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const callback = useRef(onOutside);
  callback.current = onOutside;
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) callback.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [ref]);
}
