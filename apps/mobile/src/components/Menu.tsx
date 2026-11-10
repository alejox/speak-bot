import { useEffect, useId, useRef, type KeyboardEvent, type RefObject } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Shown but not chosen; `description` says why. */
  disabled?: boolean;
  description?: string;
}

interface MenuProps {
  /** The menu's accessible name. */
  label: string;
  items: readonly MenuItem[];
  /** Escape or Tab: close the menu and send focus back to what opened it. */
  onClose: () => void;
}

/**
 * A menu of plain-text items (WAI-ARIA menu pattern): the first item takes focus, the arrow keys, Home and End
 * move through the items, Escape and Tab close it.
 */
export function Menu({ label, items, onClose }: MenuProps) {
  const descriptionPrefix = useId();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    container.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const elements = Array.from(container.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
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

  return (
    <div ref={container} role="menu" aria-label={label} className="menu" onKeyDown={handleKeyDown}>
      {items.map((item, index) => {
        const descriptionId = `${descriptionPrefix}-${index}`;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="menu-item"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            aria-describedby={item.description ? descriptionId : undefined}
            title={item.description}
            onClick={() => !item.disabled && item.onSelect()}
          >
            {item.label}
            {item.description && (
              <span id={descriptionId} hidden>
                {item.description}
              </span>
            )}
          </button>
        );
      })}
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
