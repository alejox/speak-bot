import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";

interface ConnectPanelProps {
  lanUrls: string[];
  selectedUrl: string;
  onSelectUrl: (url: string) => void;
  /** Image URL of the QR code for `selectedUrl`; null while it renders or without a network. */
  qrImage: string | null;
  overlayUrl: string;
  /** Result of the last copy, shown briefly. */
  copyStatus: MessageKey | null;
  onCopyOverlayUrl: () => void;
}

/** Shown on the computer: how to open the app on a phone and how to add captions to OBS. */
export function ConnectPanel({ lanUrls, selectedUrl, onSelectUrl, qrImage, overlayUrl, copyStatus, onCopyOverlayUrl }: ConnectPanelProps) {
  const t = useT();
  return (
    <section className="connect" aria-labelledby="connect-title">
      <h2 id="connect-title">{t("connect.title")}</h2>

      {lanUrls.length === 0 ? (
        <p className="connect-hint">{t("connect.noNetwork")}</p>
      ) : (
        <div className="connect-phone">
          {qrImage && <img className="connect-qr" src={qrImage} alt={t("connect.qrAlt", { url: selectedUrl })} width={180} height={180} />}
          <div className="connect-details">
            <p className="connect-hint">{t("connect.scanHint")}</p>
            <p className="connect-url">
              <code>{selectedUrl}</code>
            </p>
            {lanUrls.length > 1 && (
              <label className="field">
                <span>{t("connect.networkAddress")}</span>
                <select value={selectedUrl} onChange={(event) => onSelectUrl(event.target.value)}>
                  {lanUrls.map((url) => (
                    <option key={url} value={url}>
                      {url}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="connect-obs">
        <p className="connect-hint">
          {t("connect.obsHint")} <code>{overlayUrl}</code>
        </p>
        <button type="button" className="button" onClick={onCopyOverlayUrl}>
          {t("connect.copyObsUrl")}
        </button>
        <span className="connect-status" role="status" aria-live="polite">
          {copyStatus ? t(copyStatus) : ""}
        </span>
      </div>
    </section>
  );
}
