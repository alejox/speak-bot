import { boardPageCount, keysOnPage, KEYS_PER_PAGE, type Action, type Board, type Key } from "@speed-deck/core";
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import type { BoardNavigation } from "../app/use-boards";
import { keyIconId, keyLabel, presentKey, type KeyContext } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import { BoardKey } from "./BoardKey";

/** How long a key must be held to open its editor instead of running it. */
export const LONG_PRESS_MS = 500;
/** A click this soon after a long press opened the editor is the end of that press, not a new tap. */
const LONG_PRESS_CLICK_WINDOW_MS = 1500;

interface BoardPlayerProps {
  boards: readonly Board[];
  navigation: BoardNavigation;
  context: KeyContext;
  /** Runs a key's action; called synchronously inside the tap. */
  onRun: (action: Action) => void;
  /** Opens the key editor for a slot; without it keys cannot be edited from the player. */
  onEditKey?: (slot: number) => void;
  /** Edit mode: tapping any key or empty space opens the editor. */
  isEditing?: boolean;
  /** Buttons shown next to the board selector (e.g. the Edit toggle). */
  toolbar?: ReactNode;
  /** "dock" is the compact layout for the OBS dock. */
  variant?: "full" | "dock";
}

/** Plays a board: board selector, a page of keys and the pager. Keys show live OBS and captions state. */
export function BoardPlayer({ boards, navigation, context, onRun, onEditKey, isEditing = false, toolbar, variant = "full" }: BoardPlayerProps) {
  const t = useT();
  const selectId = useId();
  const reasonPrefix = useId();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPress = useRef<{ slot: number; at: number } | null>(null);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const { board, position } = navigation;
  if (!board || !position) return null;

  const pageCount = boardPageCount(board);
  const page = position.page;
  const keys = keysOnPage(board, page);

  const press = (event: MouseEvent<HTMLButtonElement>, slot: number, key: Key | undefined, disabled: boolean) => {
    const fired = longPress.current;
    longPress.current = null;
    // Keyboard activation (detail 0) is never the end of a long press, so it is never swallowed.
    if (fired && fired.slot === slot && event.detail !== 0 && Date.now() - fired.at < LONG_PRESS_CLICK_WINDOW_MS) return;
    if (isEditing || !key) {
      onEditKey?.(slot);
      return;
    }
    if (!disabled) onRun(key.action);
  };

  const startLongPress = (slot: number) => {
    if (!onEditKey) return;
    clearTimeout(pressTimer.current);
    longPress.current = null;
    pressTimer.current = setTimeout(() => {
      longPress.current = { slot, at: Date.now() };
      onEditKey(slot);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => clearTimeout(pressTimer.current);

  return (
    <section className={`deck deck-${variant}`} aria-label={board.name}>
      <div className="deck-header">
        <label htmlFor={selectId} className={variant === "dock" ? "visually-hidden" : "deck-board-label"}>
          {t("board.select")}
        </label>
        <select
          id={selectId}
          className="deck-board-select"
          value={board.id}
          onChange={(event) => navigation.go({ boardId: event.target.value, page: 0 })}
        >
          {boards.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        {toolbar}
      </div>

      {isEditing && <p className="deck-hint">{t("board.editHint")}</p>}

      <ol className={`deck-grid${isEditing ? " deck-grid-editing" : ""}`} aria-label={t("board.keys", { board: board.name })}>
        {keys.map((key, index) => {
          const slot = page * KEYS_PER_PAGE + index;
          if (!key) {
            return (
              <li key={slot}>
                {onEditKey && isEditing ? (
                  <button
                    type="button"
                    className="deck-key deck-key-empty"
                    aria-label={t("board.addKey", { number: slot + 1 })}
                    onClick={(event) => press(event, slot, undefined, false)}
                  >
                    <span className="deck-key-plus" aria-hidden="true">
                      +
                    </span>
                  </button>
                ) : (
                  <div className="deck-key deck-key-empty" aria-hidden="true" />
                )}
              </li>
            );
          }
          const label = keyLabel(key, boards, t);
          const presentation = presentKey(key.action, context);
          const disabled = presentation.disabledReason !== undefined;
          const reasonId = `${reasonPrefix}-${slot}`;
          const reason = presentation.disabledReason ? t(presentation.disabledReason) : undefined;
          return (
            <li key={slot}>
              <BoardKey
                label={label}
                iconId={keyIconId(key)}
                color={key.color}
                pressed={presentation.pressed}
                detail={presentation.detail ? t(presentation.detail.key, presentation.detail.params) : undefined}
                aria-label={isEditing ? t("board.editKey", { number: slot + 1, label }) : undefined}
                aria-disabled={disabled && !isEditing ? true : undefined}
                aria-describedby={reason ? reasonId : undefined}
                title={reason}
                className={disabled ? "deck-key-unavailable" : undefined}
                onClick={(event) => press(event, slot, key, disabled)}
                onContextMenu={(event) => {
                  if (!onEditKey) return;
                  event.preventDefault();
                  onEditKey(slot);
                }}
                onPointerDown={() => startLongPress(slot)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
              />
              {reason && (
                <span id={reasonId} hidden>
                  {reason}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="deck-pager">
        <button
          type="button"
          className="button button-small"
          onClick={() => navigation.go({ boardId: board.id, page: page - 1 })}
          disabled={page === 0}
          aria-label={t("board.previous")}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="deck-page" aria-live="polite">
          {t("board.page", { page: page + 1, count: pageCount })}
        </span>
        <button
          type="button"
          className="button button-small"
          onClick={() => navigation.go({ boardId: board.id, page: page + 1 })}
          disabled={page >= pageCount - 1}
          aria-label={t("board.next")}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
