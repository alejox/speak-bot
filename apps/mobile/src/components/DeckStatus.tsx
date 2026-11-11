import { MonitorOff, Plug, Unplug } from "lucide-react";
import { useId } from "react";
import type { ObsLive } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import { obsTone, StatusDot } from "./StatusDot";

interface DeckStatusProps {
  /** The computer app runs the keys of this device. */
  isComputerConnected: boolean;
  /** Null until the computer answered. */
  obs: ObsLive | null;
}

/** The connection the Deck runs its keys through. */
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

interface DeckStatusIndicatorProps extends DeckStatusProps {
  /** Why the keys cannot run from here and how to fix it; the indicator then leads to Settings. */
  note?: string;
  onOpenSettings: () => void;
  /** Where the indicator leads when the computer runs the keys but OBS is not connected. */
  onOpenObs: () => void;
}

/**
 * The Deck status as one icon (every width), so the space shows only keys and controls. Its name
 * and tooltip carry the full text; green with a filled dot when OBS is connected, red with a hollow ring
 * when not. With a note it becomes the way to Settings and the note describes it; when only OBS is
 * missing it leads to the OBS section.
 */
export function DeckStatusIndicator({ isComputerConnected, obs, note, onOpenSettings, onOpenObs }: DeckStatusIndicatorProps) {
  const t = useT();
  const noteId = useId();
  const { isObsConnected, connection, ConnectionIcon, isLive, isRecording } = deckConnection(isComputerConnected, obs);
  const summary = [t(`deck.status.${connection}`), isLive && t("deck.status.live"), isRecording && t("deck.status.recording")].filter(Boolean).join(", ");
  const tone = obsTone(isComputerConnected, obs);
  const className = ["deck-indicator", `deck-indicator-${tone}`, isLive || isRecording ? "deck-indicator-live" : ""].filter(Boolean).join(" ");
  const icon = (
    <>
      <ConnectionIcon size={20} aria-hidden="true" focusable="false" />
      {(isLive || isRecording) && <span className="deck-indicator-dot" aria-hidden="true" />}
      <StatusDot tone={tone} />
    </>
  );
  if (!note && !isObsConnected) {
    return (
      <button type="button" className={`${className} deck-indicator-link`} aria-label={`${summary}. ${t("deck.openObs")}`} title={summary} onClick={onOpenObs}>
        {icon}
      </button>
    );
  }
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
