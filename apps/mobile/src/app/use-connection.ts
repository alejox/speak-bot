import { useEffect, useRef, useState } from "react";
import type { ConnectionInfo } from "../adapters/desktop-api";
import type { MessageKey } from "../i18n/messages";
import type { ConnectionServices } from "./composition-root";

/** Which URL was copied last, and whether it worked. */
export interface CopyStatus {
  target: "overlay" | "dock";
  message: MessageKey;
}

export interface ConnectionState {
  lanUrls: string[];
  selectedUrl: string;
  onSelectUrl: (url: string) => void;
  qrImage: string | null;
  overlayUrl: string;
  dockUrl: string;
  copyStatus: CopyStatus | null;
  onCopyOverlayUrl: () => void;
  onCopyDockUrl: () => void;
}

const COPY_STATUS_MS = 2500;

/**
 * Loads what a phone and OBS need to reach this desktop. Returns null unless the page is open
 * on the desktop computer itself and a desktop server answered (`isDesktopAvailable`).
 */
export function useConnection(connection: ConnectionServices | undefined, isDesktopAvailable: boolean): ConnectionState | null {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!connection || !isDesktopAvailable) return;
    let active = true;
    connection.load().then(
      (loaded) => {
        if (!active) return;
        setInfo(loaded);
        setSelectedUrl(loaded.lanUrls[0] ?? "");
      },
      () => active && setInfo(null),
    );
    return () => {
      active = false;
    };
  }, [connection, isDesktopAvailable]);

  useEffect(() => {
    if (!connection || !selectedUrl) {
      setQrImage(null);
      return;
    }
    let active = true;
    connection.createQrCode(selectedUrl).then(
      (image) => active && setQrImage(image),
      () => active && setQrImage(null),
    );
    return () => {
      active = false;
    };
  }, [connection, selectedUrl]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  if (!connection || !isDesktopAvailable || !info) return null;

  const copy = (target: CopyStatus["target"], url: string) => {
    void connection.copyText(url).then((copied) => {
      setCopyStatus({ target, message: copied ? "connect.copied" : "connect.copyFailed" });
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyStatus(null), COPY_STATUS_MS);
    });
  };

  return {
    lanUrls: info.lanUrls,
    selectedUrl,
    onSelectUrl: setSelectedUrl,
    qrImage,
    overlayUrl: info.overlayUrl,
    dockUrl: info.dockUrl,
    copyStatus,
    onCopyOverlayUrl: () => copy("overlay", info.overlayUrl),
    onCopyDockUrl: () => copy("dock", info.dockUrl),
  };
}
