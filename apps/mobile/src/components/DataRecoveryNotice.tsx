import type { DataRecoveryNotice as Notice } from "@speed-deck/core";
import { useT } from "../i18n/I18nProvider";

interface DataRecoveryNoticeProps {
  notice: Notice;
  onDismiss: () => void;
}

/**
 * Presentational: tells the person at the computer that the boards file was found damaged, what Speed Deck
 * did (put back the last saved copy, or started with the default boards) and where the damaged file was
 * kept. It stays until dismissed; the computer remembers the dismissal.
 */
export function DataRecoveryNotice({ notice, onDismiss }: DataRecoveryNoticeProps) {
  const t = useT();
  return (
    // Laid out with the existing notice and button styles; the path can be long, so it may wrap anywhere.
    <div className="notice" role="alert" data-testid="data-recovery-notice" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
      <p style={{ margin: 0, flex: "1 1 16rem", overflowWrap: "anywhere" }}>
        {t(notice.outcome === "restored" ? "recovery.restored" : "recovery.defaults", { path: notice.damagedCopyPath })}
      </p>
      <button type="button" className="button button-small" onClick={onDismiss}>
        {t("recovery.dismiss")}
      </button>
    </div>
  );
}
