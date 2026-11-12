import { contrastTextColor } from "@speed-deck/core";
import { Headphones, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { forwardRef, useId, type CSSProperties, type HTMLAttributes } from "react";
import { useInputVolume, type InputVolumeServices } from "../app/use-input-volume";
import { useT } from "../i18n/I18nProvider";
import { KeyIcon } from "./KeyIcon";

interface VolumeKeyProps {
  /** The text on the key: its own label, otherwise the input name. */
  label: string;
  inputName: string;
  /** The key's icon (the action's own when it has none). */
  iconId?: string;
  color?: string;
  /** Taller than wide on screen: the slider runs bottom to top. */
  vertical: boolean;
  /** OBS mutes the input: the key looks muted, and its slider still sets the volume (as in OBS). */
  muted?: boolean;
  /** OBS monitors the input (heard on the computer). */
  monitored?: boolean;
  /** Mutes or unmutes the input in OBS; without it the key has no Mute button. */
  onToggleMute?: () => void;
  /** Turns OBS monitoring of the input on or off; without it the key has no Monitor button. */
  onToggleMonitor?: () => void;
  /** Why the key cannot be used right now (no computer, OBS off); undefined when it can. */
  disabledReason?: string;
  services: InputVolumeServices | null;
  selected?: boolean;
  className?: string;
  /** The key's title row: where a long press opens its menu or lifts it to move, away from the slider. */
  handleProps?: HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  /** Drop target handlers of the whole key. */
  dropProps?: HTMLAttributes<HTMLDivElement>;
  /** Keyboard shortcuts on the slider itself (the key menu). */
  onSliderKeyDown?: HTMLAttributes<HTMLInputElement>["onKeyDown"];
}

/**
 * A deck key that sets the volume of one OBS input with a slider, moving like the OBS mixer fader. Pressing
 * or dragging the slider only changes the volume; the key's menu opens from its title row or its "more" button.
 */
export const VolumeKey = forwardRef<HTMLInputElement, VolumeKeyProps>(function VolumeKey(
  { label, inputName, iconId, color, vertical, muted = false, monitored = false, onToggleMute, onToggleMonitor, disabledReason, services, selected = false, className, handleProps, dropProps, onSliderKeyDown },
  ref,
) {
  const t = useT();
  const reasonId = useId();
  const volume = useInputVolume(services, inputName, disabledReason === undefined);
  const reason = disabledReason ?? (volume.missing ? t("key.inputMissing") : undefined);
  const disabled = reason !== undefined || volume.percent === null;
  const percent = volume.percent ?? 0;
  const valueText = muted ? t("volume.mutedValue", { percent }) : t("volume.value", { percent });
  // A mic-like key (its icon is the mic) mutes with a mic; any other input with a speaker.
  const isMic = iconId === "mic";
  const MuteIcon = isMic ? (muted ? MicOff : Mic) : muted ? VolumeX : Volume2;
  const colors: CSSProperties | undefined = color
    ? ({ "--key-color": color, backgroundColor: color, color: contrastTextColor(color), borderColor: color } as CSSProperties)
    : undefined;
  const classes = [
    "deck-key",
    "deck-key-command",
    "deck-volume",
    vertical ? "deck-volume-vertical" : "",
    muted && !reason ? "deck-volume-muted" : "",
    color ? "deck-key-colored" : "",
    reason ? "deck-key-unavailable" : "",
    selected ? "deck-key-selected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={colors} data-state={muted && !reason ? "muted" : undefined} {...dropProps}>
      <div className="deck-volume-head" {...handleProps}>
        {iconId && <KeyIcon id={muted && iconId === "mic" ? "mic-off" : iconId} size={20} />}
        <span className="deck-key-text">{label}</span>
        {volume.percent !== null && !reason && (
          <span className="deck-volume-value" aria-hidden="true">
            {muted ? t("volume.muted") : valueText}
          </span>
        )}
      </div>
      <input
        ref={ref}
        type="range"
        className="deck-volume-range"
        style={{ "--volume-percent": `${percent}%` } as CSSProperties}
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        aria-label={inputName}
        aria-valuetext={valueText}
        aria-describedby={reason ? reasonId : undefined}
        onPointerDown={volume.hold}
        onPointerUp={volume.release}
        onPointerCancel={volume.release}
        onKeyUp={volume.release}
        onBlur={volume.release}
        onKeyDown={onSliderKeyDown}
        onChange={(event) => volume.change(Number(event.target.value))}
      />
      {(onToggleMute || onToggleMonitor) && (
        <div className="deck-volume-toggles">
          {onToggleMute && (
            <button
              type="button"
              className="deck-volume-toggle"
              aria-label={t("volume.mute", { input: inputName })}
              title={t("volume.mute", { input: inputName })}
              aria-pressed={muted}
              aria-describedby={reason ? reasonId : undefined}
              disabled={reason !== undefined}
              onClick={onToggleMute}
            >
              <MuteIcon size={20} aria-hidden="true" />
            </button>
          )}
          {onToggleMonitor && (
            <button
              type="button"
              className="deck-volume-toggle"
              aria-label={t("volume.monitor", { input: inputName })}
              title={monitored ? t("volume.monitoring") : t("volume.monitor", { input: inputName })}
              aria-pressed={monitored}
              aria-describedby={reason ? reasonId : undefined}
              disabled={reason !== undefined}
              onClick={onToggleMonitor}
            >
              <Headphones size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {reason && (
        <span id={reasonId} className="deck-volume-reason">
          {reason}
        </span>
      )}
    </div>
  );
});
