import { contrastTextColor } from "@speed-deck/core";
import { Check, ChevronLeft, ChevronRight, Unplug, Volume2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import type { KeyLiveState, KeyRole } from "../app/key-presentation";
import { KeyIcon } from "./KeyIcon";

const CUE_SIZE = 16;
/** Icons that already point somewhere, so a navigation key needs no extra arrow. */
const DIRECTION_ICONS: ReadonlySet<string> = new Set(["arrow-left", "arrow-right"]);

export interface BoardKeyView {
  label: string;
  /** No icon when absent: the key is text only. */
  iconId?: string;
  /** `#rrggbb`; the default key color when absent. */
  color?: string;
  /** Phrase, command or navigation: each has its own shape. A phrase when absent. */
  role?: KeyRole;
  /** A command that stops something: its icon takes the danger colour. */
  danger?: boolean;
  /** Toggle state; undefined for plain keys. */
  pressed?: boolean;
  /** Which "on" a pressed toggle shows, with the words for it when it has any. */
  state?: KeyLiveState;
  stateLabel?: string;
  /** Extra line under the label (e.g. the current voice language). */
  detail?: string;
  /** The device is saying this key right now. */
  speaking?: boolean;
  /** The key cannot run right now (the computer or OBS is missing). */
  offline?: boolean;
  /** A navigation key that goes back, so its arrow points left. */
  backwards?: boolean;
}

type BoardKeyProps = BoardKeyView &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "role"> & {
    /** Highlighted as the key being edited. */
    selected?: boolean;
  };

/**
 * A deck key. Text first: the label, with an icon above it only when there is one to show.
 * A key with its own color keeps it, with black or white text, whichever reads better.
 * Every state is drawn with a shape, an icon or words as well as a colour.
 */
export const BoardKey = forwardRef<HTMLButtonElement, BoardKeyProps>(function BoardKey(
  { label, iconId, color, role = "phrase", danger = false, pressed, state, stateLabel, detail, speaking = false, offline = false, backwards = false, selected = false, className, style, ...button },
  ref,
) {
  // The colour fills the key as a gradient (deck.css reads --key-color); the flat colour is the fallback.
  const colors: CSSProperties | undefined = color
    ? ({ "--key-color": color, backgroundColor: color, color: contrastTextColor(color), borderColor: color } as CSSProperties)
    : undefined;
  const classes = [
    "deck-key",
    `deck-key-${role}`,
    color ? "deck-key-colored" : "",
    danger ? "deck-key-danger" : "",
    speaking ? "deck-key-speaking" : "",
    offline ? "deck-key-unavailable" : "",
    selected ? "deck-key-selected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const NavigationCue = backwards ? ChevronLeft : ChevronRight;
  const cue = offline ? (
    <Unplug size={CUE_SIZE} />
  ) : speaking ? (
    <Volume2 size={CUE_SIZE} />
  ) : state === "scene" ? (
    <Check size={CUE_SIZE} />
  ) : role === "navigation" && !(iconId && DIRECTION_ICONS.has(iconId)) ? (
    <NavigationCue size={CUE_SIZE} />
  ) : null;
  // A toggle that is on shows a small dot in the corner; the current scene has its tick instead.
  const hasDot = state !== undefined && state !== "scene";
  return (
    <button ref={ref} type="button" className={classes} aria-pressed={pressed} data-state={state} style={{ ...colors, ...style }} {...button}>
      {hasDot && <span className="deck-key-dot" aria-hidden="true" />}
      {cue && (
        <span className="deck-key-cue" aria-hidden="true">
          {cue}
        </span>
      )}
      {iconId && <KeyIcon id={iconId} size={36} />}
      <span className="deck-key-text">{label}</span>
      {/* The spaces keep the words apart in the key's accessible name; the layout ignores them. The dot shows the state, the word names it. */}
      {stateLabel && (
        <>
          {" "}
          <span className="visually-hidden">{stateLabel}</span>
        </>
      )}
      {detail && (
        <>
          {" "}
          <span className="deck-key-detail">{detail}</span>
        </>
      )}
    </button>
  );
});
