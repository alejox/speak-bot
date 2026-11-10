import { BOARD_KINDS, boardPageCount, keysOnPage, KEYS_PER_PAGE, type Action, type Board, type Key } from "@speed-deck/core";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { BoardNavigation } from "../app/use-boards";
import { KEY_STATE_LABELS, keyLabel, keyLook, presentKey, type KeyContext } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import { BoardKey } from "./BoardKey";

interface BoardPlayerProps {
  /** The boards the selector offers; `context.boards` holds every board, for keys that open one. */
  boards: readonly Board[];
  /** Groups the selector's boards by kind, for a player that lists both kinds (the OBS dock). */
  groupByKind?: boolean;
  navigation: BoardNavigation;
  context: KeyContext;
  /** Runs a key's action; called synchronously inside the tap. */
  onRun: (action: Action) => void;
  /** Speech is playing; the phrase key that started it stays marked until it ends. */
  isSpeaking?: boolean;
  /** Opens the key editor for a slot; without it keys cannot be edited from the player. */
  onEditKey?: (slot: number) => void;
  /** Edit mode, the only way into the key editor: tapping any key or empty space opens it. */
  isEditing?: boolean;
  /** Buttons shown next to the board selector (e.g. the Edit toggle). */
  toolbar?: ReactNode;
  /** "dock" is the compact layout for the OBS dock. */
  variant?: "full" | "dock";
}

/** Plays a board: board selector, a page of keys and the pager. Keys show live OBS and captions state. */
export function BoardPlayer({ boards, groupByKind = false, navigation, context, onRun, isSpeaking = false, onEditKey, isEditing = false, toolbar, variant = "full" }: BoardPlayerProps) {
  const t = useT();
  const selectId = useId();
  const descriptionPrefix = useId();
  // The phrase key tapped last; it shows as speaking for as long as speech plays.
  const [spoken, setSpoken] = useState<{ boardId: string; slot: number } | null>(null);

  useEffect(() => {
    if (!isSpeaking) setSpoken(null);
  }, [isSpeaking]);

  const { board, position } = navigation;
  if (!board || !position) return null;

  const pageCount = boardPageCount(board);
  const page = position.page;
  const keys = keysOnPage(board, page);

  const press = (slot: number, key: Key | undefined, disabled: boolean) => {
    if (isEditing || !key) {
      onEditKey?.(slot);
      return;
    }
    if (disabled) return;
    setSpoken(key.action.type === "voice.speak" ? { boardId: board.id, slot } : null);
    onRun(key.action);
  };

  const boardOptions = (candidates: readonly Board[]) =>
    candidates.map((candidate) => (
      <option key={candidate.id} value={candidate.id}>
        {candidate.name}
      </option>
    ));
  const boardGroups = BOARD_KINDS.map((kind) => ({ kind, boards: boards.filter((candidate) => candidate.kind === kind) })).filter((group) => group.boards.length > 0);

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
          {groupByKind
            ? boardGroups.map((group) => (
                <optgroup key={group.kind} label={t(`nav.${group.kind}`)}>
                  {boardOptions(group.boards)}
                </optgroup>
              ))
            : boardOptions(boards)}
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
                {onEditKey ? (
                  <button
                    type="button"
                    className="deck-key deck-key-empty"
                    aria-label={t("board.addKey", { number: slot + 1 })}
                    onClick={() => press(slot, undefined, false)}
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
          const label = keyLabel(key, context.boards, t);
          const presentation = presentKey(key.action, context);
          const disabled = presentation.disabledReason !== undefined;
          const reason = presentation.disabledReason ? t(presentation.disabledReason) : undefined;
          const stateLabel = presentation.state && KEY_STATE_LABELS[presentation.state];
          const speaking = !isEditing && isSpeaking && spoken?.boardId === board.id && spoken.slot === slot;
          // Why the key is offline, or that it is being said: hidden text the key points to.
          const description = reason ?? (speaking ? t("key.speaking") : undefined);
          const descriptionId = `${descriptionPrefix}-${slot}`;
          return (
            <li key={slot}>
              <BoardKey
                label={label}
                {...keyLook(key, presentation.iconId)}
                color={key.color}
                pressed={presentation.pressed}
                state={presentation.state}
                stateLabel={stateLabel ? t(stateLabel) : undefined}
                detail={presentation.detail ? t(presentation.detail.key, presentation.detail.params) : undefined}
                speaking={speaking}
                offline={disabled}
                aria-label={isEditing ? t("board.editKey", { number: slot + 1, label }) : undefined}
                aria-disabled={disabled && !isEditing ? true : undefined}
                aria-describedby={description ? descriptionId : undefined}
                title={reason}
                onClick={() => press(slot, key, disabled)}
              />
              {description && (
                <span id={descriptionId} hidden>
                  {description}
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
