import { CircleDot, MonitorOff, Plug, Radio, Unplug } from "lucide-react";
import { useId } from "react";
import type { ObsLive } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";

const ICON_SIZE = 16;

interface DeckStatusProps {
  /** The computer app runs the keys of this device. */
  isComputerConnected: boolean;
  /** Null until the computer answered. */
  obs: ObsLive | null;
}

/** The connection the Deck runs its keys through, read once for both the pills and the compact indicator. */
function deckConnection(isComputerConnected: boolean, obs: ObsLive | null) {
  const isObsConnected = isComputerConnected && obs !== null && obs.enabled && obs.status === "connected";
  return {
    isObsConnected,
    connection: !isComputerConnected ? "noComputer" : isObsConnected ? "obsConnected" : "obsDisconnected",
    ConnectionIcon: !isComputerConnected ? MonitorOff : isObsConnected ? Plug : Unplug,
    isLive: isObsConnected && obs.state.streaming,
    isRecording: isObsConnected && obs.state.recording,
  } as const;
}

/** What the Deck is connected to right now: the computer, OBS, and whether OBS is live or recording. */
export function DeckStatus({ isComputerConnected, obs }: DeckStatusProps) {
  const t = useT();
  const { isObsConnected, connection, ConnectionIcon, isLive, isRecording } = deckConnection(isComputerConnected, obs);
  return (
    <div className="deck-status" role="group" aria-label={t("deck.status.label")}>
      <span className={`pill pill-${isObsConnected ? "ok" : "off"}`}>
        <ConnectionIcon size={ICON_SIZE} aria-hidden="true" focusable="false" />
        {t(`deck.status.${connection}`)}
      </span>
      {isLive && (
        <span className="pill pill-live">
          <Radio size={ICON_SIZE} aria-hidden="true" focusable="false" />
          {t("deck.status.live")}
        </span>
      )}
      {isRecording && (
        <span className="pill pill-recording">
          <CircleDot size={ICON_SIZE} aria-hidden="true" focusable="false" />
          {t("deck.status.recording")}
        </span>
      )}
    </div>
  );
}

interface DeckStatusIndicatorProps extends DeckStatusProps {
  /** Why the keys cannot run from here and how to fix it; the indicator then leads to Settings. */
  note?: string;
  onOpenSettings: () => void;
}

/**
 * The Deck status as one icon (wide screens), so the workspace shows only keys and controls. Its name
 * and tooltip carry the full text; with a note it becomes the way to Settings and the note describes it.
 */
export function DeckStatusIndicator({ isComputerConnected, obs, note, onOpenSettings }: DeckStatusIndicatorProps) {
  const t = useT();
  const noteId = useId();
  const { isObsConnected, connection, ConnectionIcon, isLive, isRecording } = deckConnection(isComputerConnected, obs);
  const summary = [t(`deck.status.${connection}`), isLive && t("deck.status.live"), isRecording && t("deck.status.recording")].filter(Boolean).join(", ");
  const className = ["deck-indicator", isObsConnected ? "deck-indicator-ok" : "", isLive || isRecording ? "deck-indicator-live" : ""].filter(Boolean).join(" ");
  const icon = (
    <>
      <ConnectionIcon size={20} aria-hidden="true" focusable="false" />
      {(isLive || isRecording) && <span className="deck-indicator-dot" aria-hidden="true" />}
    </>
  );
  if (!note) {
    return (
      <span className={className} role="img" aria-label={summary} title={summary}>
        {icon}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`${className} deck-indicator-link`}
        aria-label={`${summary}. ${t("deck.openSettings")}`}
        aria-describedby={noteId}
        title={`${summary}. ${note}`}
        onClick={onOpenSettings}
      >
        {icon}
      </button>
      <span id={noteId} hidden>
        {note}
      </span>
    </>
  );
}
