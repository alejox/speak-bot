interface ConnectPanelProps {
  lanUrls: string[];
  selectedUrl: string;
  onSelectUrl: (url: string) => void;
  /** Image URL of the QR code for `selectedUrl`; null while it renders or without a network. */
  qrImage: string | null;
  overlayUrl: string;
  copyStatus: string;
  onCopyOverlayUrl: () => void;
}

/** Shown on the computer: how to open the app on a phone and how to add captions to OBS. */
export function ConnectPanel({ lanUrls, selectedUrl, onSelectUrl, qrImage, overlayUrl, copyStatus, onCopyOverlayUrl }: ConnectPanelProps) {
  return (
    <section className="connect" aria-labelledby="connect-title">
      <h2 id="connect-title">Connect your phone</h2>

      {lanUrls.length === 0 ? (
        <p className="connect-hint">No network found. Connect this computer to the same Wi-Fi as your phone.</p>
      ) : (
        <div className="connect-phone">
          {qrImage && <img className="connect-qr" src={qrImage} alt={`QR code for ${selectedUrl}`} width={180} height={180} />}
          <div className="connect-details">
            <p className="connect-hint">Scan the code with your phone's camera, or open this address on a phone on the same Wi-Fi:</p>
            <p className="connect-url">
              <code>{selectedUrl}</code>
            </p>
            {lanUrls.length > 1 && (
              <label className="field">
                <span>Network address</span>
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
          Captions for OBS (add a Browser Source): <code>{overlayUrl}</code>
        </p>
        <button type="button" className="button" onClick={onCopyOverlayUrl}>
          Copy OBS URL
        </button>
        <span className="connect-status" role="status" aria-live="polite">
          {copyStatus}
        </span>
      </div>
    </section>
  );
}
