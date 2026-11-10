import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../i18n/I18nProvider";
import { Menu, useOutsidePress } from "./Menu";

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
 * Shift+F10 or the context-menu key.
 */
export function KeyMenu({ slot, label, onEdit, onDelete, onClose }: KeyMenuProps) {
  const t = useT();
  const promptId = useId();
  const container = useRef<HTMLDivElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useOutsidePress(container, () => onClose(false));

  useEffect(() => {
    if (isConfirming) keepButton.current?.focus();
  }, [isConfirming]);

  const confirm = () => {
    setIsBusy(true);
    void onDelete().then((deleted) => {
      setIsBusy(false);
      if (!deleted) setIsConfirming(false);
    });
  };

  const handleConfirmKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    }
  };

  return (
    <div ref={container} className="popover key-menu">
      {isConfirming ? (
        <div className="menu-confirm" role="group" aria-labelledby={promptId} onKeyDown={handleConfirmKeyDown}>
          <p id={promptId}>{t("keyMenu.deleteConfirm", { label })}</p>
          <div className="menu-confirm-actions">
            <button ref={keepButton} type="button" className="menu-item" onClick={() => onClose(true)}>
              {t("keyMenu.deleteNo")}
            </button>
            <button type="button" className="menu-item menu-item-danger" onClick={confirm} disabled={isBusy}>
              {t("keyMenu.deleteYes")}
            </button>
          </div>
        </div>
      ) : (
        <Menu
          label={t("keyMenu.label", { number: slot + 1, label })}
          items={[
            { label: t("keyMenu.edit"), onSelect: onEdit },
            { label: t("keyMenu.delete"), onSelect: () => setIsConfirming(true) },
          ]}
          onClose={() => onClose(true)}
        />
      )}
    </div>
  );
}
