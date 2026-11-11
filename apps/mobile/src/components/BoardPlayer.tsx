import { boardPageCount, keysOnPage, keysPerPage, MAX_BOARD_PAGES, type Action, type Key } from "@speed-deck/core";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { BoardNavigation } from "../app/use-boards";
import { KEY_STATE_LABELS, keyFillColor, keyLabel, keyLook, presentKey, type KeyContext } from "../app/key-presentation";
import { useMediaQuery } from "../app/use-media-query";
import { useT } from "../i18n/I18nProvider";
import { BoardKey } from "./BoardKey";
import { KeyMenu } from "./KeyMenu";

/** Drag data type of a key being moved to another slot. */
const SLOT_DRAG_TYPE = "application/x-speed-deck-slot";
/** How long a touch must rest on a key to open its menu instead of running it. */
export const LONG_PRESS_MS = 500;
/** A touch that moves farther than this (px) is a scroll, not a long press. */
const LONG_PRESS_SLOP = 10;
/** Dragging keys needs a mouse or trackpad; a long touch opens the key menu instead. */
const FINE_POINTER_QUERY = "(pointer: fine)";

/** Where a page offers its one +: right after the last key, or in the first gap when the last space is taken; -1 when full. */
function addIndexOnPage(keys: readonly (Key | undefined)[]): number {
  const lastKeyIndex = keys.reduce((last, key, index) => (key ? index : last), -1);
  return lastKeyIndex < keys.length - 1 ? lastKeyIndex + 1 : keys.findIndex((key) => !key);
}

interface BoardPlayerProps {
  navigation: BoardNavigation;
  context: KeyContext;
  /** Runs a key's action; called synchronously inside the tap. */
  onRun: (action: Action) => void;
  /** Speech is playing; the phrase key that started it stays marked until it ends. */
  isSpeaking?: boolean;
  /** Opens the key dialog for a slot (add on an empty one, edit on a key); without it keys cannot be edited from the player. */
  onEditKey?: (slot: number) => void;
  /** Empties a slot; resolves true when deleted. Offered in the key menu. */
  onDeleteKey?: (slot: number) => Promise<boolean>;
  /** Moves a key to another slot, swapping with a key there; resolves true when moved. Used by drag and drop. */
  onMoveKey?: (from: number, to: number) => Promise<boolean>;
  /** The key being edited in the inspector, drawn as selected. */
  selectedSlot?: number | null;
  /** Told the slot the page on screen offers for a new key (its +), or null when that page is full. */
  onAddSlotChange?: (slot: number | null) => void;
  /** The deck's header: the board pill and its menu. */
  toolbar?: ReactNode;
  /** "dock" is the compact layout for the OBS dock. */
  variant?: "full" | "dock";
}

/** Plays a board: its header (the board pill), a page of keys and the pager. Keys show live OBS and captions state. */
export function BoardPlayer({
  navigation,
  context,
  onRun,
  isSpeaking = false,
  onEditKey,
  onDeleteKey,
  onMoveKey,
  selectedSlot = null,
  onAddSlotChange,
  toolbar,
  variant = "full",
}: BoardPlayerProps) {
  const t = useT();
  const descriptionPrefix = useId();
  // The phrase key tapped last; it shows as speaking for as long as speech plays.
  const [spoken, setSpoken] = useState<{ boardId: string; slot: number } | null>(null);
  const [menuSlot, setMenuSlot] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  // A slot whose control should take focus once it renders (the + left by a deleted key).
  const [focusSlot, setFocusSlot] = useState<number | null>(null);
  const slotButtons = useRef(new Map<number, HTMLButtonElement>());
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  // The click that ends a long press must not run the key.
  const swallowClick = useRef(false);
  const canDrag = useMediaQuery(FINE_POINTER_QUERY) && onMoveKey !== undefined;
  const canEdit = onEditKey !== undefined;
  // An empty page opened past the last one; it becomes a real page once a key is added there.
  const [newPage, setNewPage] = useState<{ boardId: string; page: number } | null>(null);

  const { board, position } = navigation;
  const pageCount = board ? boardPageCount(board) : 1;
  const showsNewPage = canEdit && board !== null && newPage?.boardId === board.id && newPage.page === pageCount;
  const page = showsNewPage ? pageCount : (position?.page ?? 0);
  const keys = board ? keysOnPage(board, page) : [];
  // Keys per page: the board's columns × rows.
  const pageSize = board ? keysPerPage(board) : 0;
  // One + per page; others (the inspector's Add key) add at the same slot.
  const plusIndex = addIndexOnPage(keys);
  const addSlot = board && plusIndex >= 0 ? page * pageSize + plusIndex : null;

  useEffect(() => {
    onAddSlotChange?.(addSlot);
  }, [addSlot, onAddSlotChange]);

  useEffect(() => {
    if (!isSpeaking) setSpoken(null);
  }, [isSpeaking]);

  useEffect(() => {
    if (focusSlot === null) return;
    slotButtons.current.get(focusSlot)?.focus();
    setFocusSlot(null);
  }, [focusSlot]);

  useEffect(() => () => cancelLongPress(), []);

  if (!board || !position) return null;

  const shownPageCount = Math.max(pageCount, page + 1);
  // Past the last page, "next" opens a new one for editors, up to the board limit.
  const opensNewPage = canEdit && page >= shownPageCount - 1 && shownPageCount < MAX_BOARD_PAGES;

  const goToPage = (next: number) => {
    setNewPage(null);
    navigation.go({ boardId: board.id, page: next });
  };
  const openNewPage = () => {
    // Saved as the position too, so the page stays once its first key makes it real.
    navigation.go({ boardId: board.id, page: pageCount });
    setNewPage({ boardId: board.id, page: pageCount });
  };

  const slotRef = (slot: number) => (element: HTMLButtonElement | null) => {
    if (element) slotButtons.current.set(slot, element);
    else slotButtons.current.delete(slot);
  };

  function cancelLongPress() {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  }

  const openMenu = (slot: number) => {
    cancelLongPress();
    setMenuSlot(slot);
  };

  const closeMenu = (restoreFocus: boolean) => {
    const slot = menuSlot;
    setMenuSlot(null);
    if (restoreFocus && slot !== null) slotButtons.current.get(slot)?.focus();
  };

  const keyMenuHandlers = (slot: number) =>
    canEdit
      ? {
          onContextMenu: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            // A touch still resting on the key (Android's long press) ends in a click that must not run it.
            if (longPress.current) swallowClick.current = true;
            openMenu(slot);
          },
          onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
              event.preventDefault();
              openMenu(slot);
            }
          },
          onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
            swallowClick.current = false;
            cancelLongPress();
            if (event.pointerType === "mouse") return;
            const timer = setTimeout(() => {
              swallowClick.current = true;
              openMenu(slot);
            }, LONG_PRESS_MS);
            longPress.current = { timer, x: event.clientX, y: event.clientY };
          },
          onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
            const start = longPress.current;
            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP) cancelLongPress();
          },
          onPointerUp: cancelLongPress,
          onPointerCancel: cancelLongPress,
          onPointerLeave: cancelLongPress,
        }
      : {};

  const dropHandlers = (slot: number) =>
    canDrag
      ? {
          onDragOver: (event: DragEvent) => {
            event.preventDefault();
            setDropSlot(slot);
          },
          onDragLeave: () => setDropSlot((value) => (value === slot ? null : value)),
          onDrop: (event: DragEvent) => {
            event.preventDefault();
            setDropSlot(null);
            const from = event.dataTransfer.getData(SLOT_DRAG_TYPE);
            if (from !== "" && Number(from) !== slot) void onMoveKey?.(Number(from), slot);
          },
        }
      : {};

  const press = (slot: number, key: Key | undefined, disabled: boolean) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (!key) {
      onEditKey?.(slot);
      return;
    }
    if (disabled) return;
    setSpoken(key.action.type === "voice.speak" ? { boardId: board.id, slot } : null);
    onRun(key.action);
  };

  return (
    <section className={`deck deck-${variant}`} aria-label={board.name}>
      {toolbar && <div className="deck-header">{toolbar}</div>}

      {/* The grid's own box, so wide layouts can size the keys to the room it gets. */}
      <div className="deck-grid-area">
        <ol
          className="deck-grid"
          aria-label={t("board.keys", { board: board.name })}
          style={{ "--grid-columns": board.columns, "--grid-rows": board.rows } as CSSProperties}
        >
          {keys.map((key, index) => {
            const slot = page * pageSize + index;
            const dropClass = dropSlot === slot ? "deck-key-drop" : "";
            if (!key) {
              return (
                <li key={slot}>
                  {onEditKey && index === plusIndex ? (
                    <button
                      ref={slotRef(slot)}
                      type="button"
                      className={["deck-key", "deck-key-empty", dropClass].filter(Boolean).join(" ")}
                      aria-label={t("board.addKey", { number: slot + 1 })}
                      onClick={() => press(slot, undefined, false)}
                      {...dropHandlers(slot)}
                    >
                      <span className="deck-key-plus" aria-hidden="true">
                        +
                      </span>
                    </button>
                  ) : (
                    // A blank space: still a place to drop a dragged key.
                    <div className="deck-key-blank" aria-hidden="true" {...dropHandlers(slot)} />
                  )}
                </li>
              );
            }
            const label = keyLabel(key, context.boards, t);
            const presentation = presentKey(key.action, context);
            const disabled = presentation.disabledReason !== undefined;
            const reason = presentation.disabledReason ? t(presentation.disabledReason) : undefined;
            const stateLabel = presentation.state && KEY_STATE_LABELS[presentation.state];
            const speaking = isSpeaking && spoken?.boardId === board.id && spoken.slot === slot;
            // Why the key is offline, or that it is being said: hidden text the key points to.
            const description = reason ?? (speaking ? t("key.speaking") : undefined);
            const descriptionId = `${descriptionPrefix}-${slot}`;
            return (
              <li key={slot} className={canEdit ? "deck-slot" : undefined}>
                <BoardKey
                  ref={slotRef(slot)}
                  label={label}
                  {...keyLook(key, presentation.iconId)}
                  color={keyFillColor(key, presentation.pressed)}
                  pressed={presentation.pressed}
                  state={presentation.state}
                  stateLabel={stateLabel ? t(stateLabel) : undefined}
                  detail={presentation.detail ? t(presentation.detail.key, presentation.detail.params) : undefined}
                  speaking={speaking}
                  offline={disabled}
                  aria-disabled={disabled ? true : undefined}
                  aria-describedby={description ? descriptionId : undefined}
                  title={reason}
                  selected={selectedSlot === slot}
                  className={dropClass || undefined}
                  aria-keyshortcuts={canEdit ? "Shift+F10" : undefined}
                  onClick={() => press(slot, key, disabled)}
                  draggable={canDrag || undefined}
                  onDragStart={
                    canDrag
                      ? (event) => {
                          cancelLongPress();
                          setMenuSlot(null);
                          event.dataTransfer.setData(SLOT_DRAG_TYPE, String(slot));
                          event.dataTransfer.effectAllowed = "move";
                        }
                      : undefined
                  }
                  {...keyMenuHandlers(slot)}
                  {...dropHandlers(slot)}
                />
                {canEdit && (
                  // A visible way into the menu for mouse users; keyboards use Shift+F10 on the key itself.
                  <button
                    type="button"
                    className="deck-key-more"
                    tabIndex={-1}
                    aria-label={t("keyMenu.options", { number: slot + 1 })}
                    aria-haspopup="menu"
                    aria-expanded={menuSlot === slot}
                    onClick={() => openMenu(slot)}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                )}
                {menuSlot === slot && onEditKey && (
                  <KeyMenu
                    slot={slot}
                    label={label}
                    onEdit={() => {
                      closeMenu(true);
                      onEditKey(slot);
                    }}
                    onDelete={async () => {
                      const deleted = (await onDeleteKey?.(slot)) ?? false;
                      if (deleted) {
                        setMenuSlot(null);
                        setFocusSlot(slot);
                      }
                      return deleted;
                    }}
                    onClose={closeMenu}
                  />
                )}
                {description && (
                  <span id={descriptionId} hidden>
                    {description}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="deck-pager">
        <button
          type="button"
          className="button button-small"
          onClick={() => goToPage(page - 1)}
          disabled={page === 0}
          aria-label={t("board.previous")}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="deck-page" aria-live="polite">
          {t("board.page", { page: page + 1, count: shownPageCount })}
        </span>
        <button
          type="button"
          className="button button-small"
          onClick={() => (opensNewPage ? openNewPage() : goToPage(page + 1))}
          disabled={!opensNewPage && page >= shownPageCount - 1}
          aria-label={opensNewPage ? t("board.addPage") : t("board.next")}
        >
          <span aria-hidden="true">{opensNewPage ? "+" : "›"}</span>
        </button>
      </div>
    </section>
  );
}
