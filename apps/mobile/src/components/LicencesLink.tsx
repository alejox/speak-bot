import { useEffect, useState, type MouseEvent } from "react";
import { useT } from "../i18n/I18nProvider";
import { ModalDialog } from "./ModalDialog";

/** Where the build puts the third-party notices, next to the app (see scripts/third-party-notices.mjs). */
export const LICENCES_PATH = "THIRD-PARTY-NOTICES.txt";

interface LicencesLinkProps {
  /** Resolves with the notices text; defaults to fetching the file shipped with this build. */
  load?: () => Promise<string>;
}

async function fetchNotices(): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}${LICENCES_PATH}`);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
  return response.text();
}

/**
 * The link to the licences of the open-source software Speed Deck ships with. It opens them inside the app,
 * in a dialog: the computer's window and the Android app have no browser tab to open a text file in. The
 * link still points at the file, so a browser can open or save it the usual way.
 */
export function LicencesLink({ load = fetchNotices }: LicencesLinkProps) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const open = (event: MouseEvent) => {
    // A modified click (new tab, save) is the browser's to handle.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setIsOpen(true);
  };
  return (
    <>
      <p className="field-hint">
        <a href={`${import.meta.env.BASE_URL}${LICENCES_PATH}`} onClick={open}>
          {t("about.licences")}
        </a>
      </p>
      {isOpen && <LicencesDialog load={load} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function LicencesDialog({ load, onClose }: { load: () => Promise<string>; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    load().then(
      (loaded) => active && setText(loaded),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <ModalDialog title={t("about.licences")} onClose={onClose} statusText={failed ? t("about.licencesFailed") : text === null ? t("about.licencesLoading") : ""}>
      {text !== null && (
        // Plain text as shipped; it scrolls inside the dialog and can be read with the keyboard.
        <pre tabIndex={0} data-autofocus style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflow: "auto", maxHeight: "60vh", margin: 0, fontSize: "0.8rem" }}>
          {text}
        </pre>
      )}
    </ModalDialog>
  );
}
