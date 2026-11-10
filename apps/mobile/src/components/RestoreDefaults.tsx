import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider";

interface RestoreDefaultsProps {
  /** Name of the built-in board that would be restored, for the confirmation. */
  boardName: string;
  onRestore: () => Promise<void>;
}

/** Puts back a built-in board, after an inline two-step confirmation (never a browser dialog). */
export function RestoreDefaults({ boardName, onRestore }: RestoreDefaultsProps) {
  const t = useT();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const promptId = useId();
  const startButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Focus the safe choice when asking, and return focus to the trigger afterwards.
  useEffect(() => {
    if (isConfirming) cancelButton.current?.focus();
    else if (wasConfirming.current) startButton.current?.focus();
    wasConfirming.current = isConfirming;
  }, [isConfirming]);

  if (!isConfirming) {
    return (
      <button ref={startButton} type="button" className="button button-small button-danger" onClick={() => setIsConfirming(true)}>
        {t("boards.restore")}
      </button>
    );
  }

  const confirm = () => {
    setIsBusy(true);
    void onRestore().finally(() => {
      setIsBusy(false);
      setIsConfirming(false);
    });
  };

  return (
    <div className="restore-confirm" role="group" aria-labelledby={promptId}>
      <p id={promptId}>{t("boards.restoreConfirm", { name: boardName })}</p>
      <div className="restore-actions">
        <button type="button" className="button button-small button-danger" onClick={confirm} disabled={isBusy}>
          {t("boards.restoreYes")}
        </button>
        <button ref={cancelButton} type="button" className="button button-small" onClick={() => setIsConfirming(false)}>
          {t("boards.restoreNo")}
        </button>
      </div>
    </div>
  );
}
