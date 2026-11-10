import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../i18n/I18nProvider";

interface KeyMenuProps {
  /** 0-based slot of the key, for the menu's name. */
  slot: number;
  /** The key's label as shown. */
  label: string;
  onEdit: () => void;
  /** Resolves true when deleted. */
  onDelete: () => Promise<boolean>;
  /** Closes the menu; `restoreFocus` sends focus back to the key. */
  onClose: (restoreFocus: boolean) => void;
}

/**
 * The menu of a key: Edit, and Delete behind an inline confirmation. Opened with a right click, a long press,
 * Shift+F10 or the context-menu key. Arrow keys move through it; Escape and Tab close it.
 */
export function KeyMenu({ slot, label, onEdit, onDelete, onClose }: KeyMenuProps) {
  const t = useT();
  const promptId = useId();
  const container = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    (isConfirming ? keepButton : firstItem).current?.focus();
  }, [isConfirming]);

  // A press anywhere else closes the menu and leaves focus where that press puts it.
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) onCloseRef.current(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (isConfirming) return;
    const items = Array.from(container.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (index + 1) % items.length
      : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length
      : event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  const confirm = () => {
    setIsBusy(true);
    void onDelete().then((deleted) => {
      setIsBusy(false);
      if (!deleted) setIsConfirming(false);
    });
  };

  return (
    <div ref={container} className="key-menu" onKeyDown={handleKeyDown}>
      {isConfirming ? (
        <div className="key-menu-confirm" role="group" aria-labelledby={promptId}>
          <p id={promptId}>{t("keyMenu.deleteConfirm", { label })}</p>
          <div className="key-menu-confirm-actions">
            <button ref={keepButton} type="button" className="key-menu-item" onClick={() => onClose(true)}>
              {t("keyMenu.deleteNo")}
            </button>
            <button type="button" className="key-menu-item key-menu-item-danger" onClick={confirm} disabled={isBusy}>
              {t("keyMenu.deleteYes")}
            </button>
          </div>
        </div>
      ) : (
        <div role="menu" aria-label={t("keyMenu.label", { number: slot + 1, label })}>
          <button ref={firstItem} type="button" role="menuitem" className="key-menu-item" tabIndex={-1} onClick={onEdit}>
            {t("keyMenu.edit")}
          </button>
          <button type="button" role="menuitem" className="key-menu-item" tabIndex={-1} onClick={() => setIsConfirming(true)}>
            {t("keyMenu.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
