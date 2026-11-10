import { CircleDot, MonitorOff, Plug, Radio, Unplug } from "lucide-react";
import type { ObsLive } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";

const ICON_SIZE = 16;

interface DeckStatusProps {
  /** The computer app runs the keys of this device. */
  isComputerConnected: boolean;
  /** Null until the computer answered. */
  obs: ObsLive | null;
}

/** What the Deck is connected to right now: the computer, OBS, and whether OBS is live or recording. */
export function DeckStatus({ isComputerConnected, obs }: DeckStatusProps) {
  const t = useT();
  const isObsConnected = isComputerConnected && obs !== null && obs.enabled && obs.status === "connected";
  const connection = !isComputerConnected ? "noComputer" : isObsConnected ? "obsConnected" : "obsDisconnected";
  const ConnectionIcon = !isComputerConnected ? MonitorOff : isObsConnected ? Plug : Unplug;
  return (
    <div className="deck-status" role="group" aria-label={t("deck.status.label")}>
      <span className={`pill pill-${isObsConnected ? "ok" : "off"}`}>
        <ConnectionIcon size={ICON_SIZE} aria-hidden="true" focusable="false" />
        {t(`deck.status.${connection}`)}
      </span>
      {isObsConnected && obs.state.streaming && (
        <span className="pill pill-live">
          <Radio size={ICON_SIZE} aria-hidden="true" focusable="false" />
          {t("deck.status.live")}
        </span>
      )}
      {isObsConnected && obs.state.recording && (
        <span className="pill pill-recording">
          <CircleDot size={ICON_SIZE} aria-hidden="true" focusable="false" />
          {t("deck.status.recording")}
        </span>
      )}
    </div>
  );
}
