import { contrastTextColor } from "@speed-deck/core";
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { KeyIcon } from "./KeyIcon";

export interface BoardKeyView {
  label: string;
  iconId: string;
  /** `#rrggbb`; the default key color when absent. */
  color?: string;
  /** Toggle state; undefined for plain keys. */
  pressed?: boolean;
  /** Extra line under the label (e.g. the current voice language). */
  detail?: string;
}

type BoardKeyProps = BoardKeyView &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
    /** Highlighted as the key being edited. */
    selected?: boolean;
  };

/** A deck key: icon, label and color. Text is black or white, whichever reads better on the key color. */
export const BoardKey = forwardRef<HTMLButtonElement, BoardKeyProps>(function BoardKey(
  { label, iconId, color, pressed, detail, selected = false, className, style, ...button },
  ref,
) {
  const colors: CSSProperties | undefined = color ? { background: color, color: contrastTextColor(color), borderColor: color } : undefined;
  const classes = ["deck-key", selected ? "deck-key-selected" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button ref={ref} type="button" className={classes} aria-pressed={pressed} style={{ ...colors, ...style }} {...button}>
      <KeyIcon id={iconId} size={28} />
      <span className="deck-key-text">{label}</span>
      {detail && <span className="deck-key-detail">{detail}</span>}
    </button>
  );
});
