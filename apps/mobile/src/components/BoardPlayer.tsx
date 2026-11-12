import { boardPageCount, coveredSlots, FOLDER_BACK_SLOT, isFolderBoard, keySpanOf, keysOnPage, keysPerPage, MAX_BOARD_PAGES, type Key } from "@speed-deck/core";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { BoardNavigation } from "../app/use-boards";
import type { KeyRun } from "../app/use-key-runner";
import { KEY_STATE_LABELS, keyFillColor, keyLabel, keyLook, presentKey, type KeyContext } from "../app/key-presentation";
import { displayedCellIndexes } from "../app/board-display";
import { hiddenKeySlots } from "../app/voice-keys";
import type { InputVolumeServices } from "../app/use-input-volume";
import { PORTRAIT_BOARD_QUERY, useMediaQuery } from "../app/use-media-query";
import { useT } from "../i18n/I18nProvider";
import { BoardKey } from "./BoardKey";
import { KeyMenu } from "./KeyMenu";
import { VolumeKey } from "./VolumeKey";

/** Drag data type of a key being moved to another slot. */
const SLOT_DRAG_TYPE = "application/x-speed-deck-slot";
/** How long a touch must rest on a key to open its menu instead of running it. */
export const LONG_PRESS_MS = 500;
/** A touch that moves farther than this (px) is a scroll, not a long press. */
const LONG_PRESS_SLOP = 10;
/** After a long press, a finger that travels farther than this (px) is moving the key, not trembling on it. */
const TOUCH_MOVE_THRESHOLD = 8;
/** Dragging keys (HTML drag and drop) needs a mouse or trackpad; a touch moves them with a long press, then a drag. */
const FINE_POINTER_QUERY = "(pointer: fine)";

/**
 * Where a page offers its one +: right after the last used cell, or in the first gap when the last space is
 * taken; -1 when full. `used` tells, per cell, whether a key sits on it or covers it.
 */
function addIndexOnPage(used: readonly boolean[]): number {
  const lastUsedIndex = used.reduce((last, isUsed, index) => (isUsed ? index : last), -1);
  return lastUsedIndex < used.length - 1 ? lastUsedIndex + 1 : used.findIndex((isUsed) => !isUsed);
}

/**
 * Where a key is drawn: its first row and column (1-based) and how many it covers, on screen. Only keys
 * covering several cells need it, unless `always` (a page drawn without its empty cells).
 */
function cellPlacement(index: number, key: Key, columns: number, transposed: boolean, always = false): CSSProperties | undefined {
  const span = keySpanOf(key);
  if (!always && span.rows === 1 && span.columns === 1) return undefined;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const [drawnRow, drawnColumn, rowSpan, columnSpan] = transposed ? [column, row, span.columns, span.rows] : [row, column, span.rows, span.columns];
  return { "--cell-row": drawnRow + 1, "--cell-column": drawnColumn + 1, "--row-span": rowSpan, "--column-span": columnSpan } as CSSProperties;
}

/**
 * How many of the board's columns and rows (from the first) a page's keys reach, at least one of each:
 * the page played on a phone drops the empty ones after them and keeps the gaps between keys.
 */
function usedExtent(keys: readonly (Key | undefined)[], columns: number): { columns: number; rows: number } {
  let usedColumns = 1;
  let usedRows = 1;
  keys.forEach((key, index) => {
    if (!key) return;
    const span = keySpanOf(key);
    usedColumns = Math.max(usedColumns, (index % columns) + span.columns);
    usedRows = Math.max(usedRows, Math.floor(index / columns) + span.rows);
  });
  return { columns: usedColumns, rows: usedRows };
}

/** The page controls handed to a pager drawn outside the deck (the Voice actions on a phone). */
export interface PagerControls {
  /** 0-based page on screen, and how many pages there are. */
  page: number;
  count: number;
  /** Absent on the first page. */
  onPrevious?: () => void;
  /** Present while a later page holds keys. */
  onNext?: () => void;
  /** Present on the last page with keys, while the board can take one more page: opens an empty page. */
  onNewPage?: () => void;
}

/** A volume slider key and the slot it is stored on. */
type VolumeKeyOnBoard = { slot: number; key: Key & { action: Extract<Key["action"], { type: "obs.inputVolume" }> } };

const isVolumeKey = (key: Key | undefined): key is VolumeKeyOnBoard["key"] => key?.action.type === "obs.inputVolume";

interface BoardPlayerProps {
  navigation: BoardNavigation;
  context: KeyContext;
  /** Runs a key's action, with the key pressed; called synchronously inside the tap. */
  onRun: KeyRun;
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
  /** A row between the header and the keys that stays the same on every page (the Voice quick phrases). */
  strip?: ReactNode;
  /**
   * A phone-sized window: the deck shows only what playing needs. Without editing (no onEditKey) the page
   * draws only its keys, on the rows and columns they reach, its volume keys move to a mixer beside them
   * (under them when upright), and the pager shows only for several pages.
   */
  compact?: boolean;
  /** "dock" is the compact layout for the OBS dock. */
  variant?: "full" | "dock";
  /** Reads, sets and follows OBS input volumes for volume keys; null in phone-only mode. */
  volumes?: InputVolumeServices | null;
  /**
   * With `compact`, while playing: the page keeps the board's whole grid (every column and row, turned
   * upright like when editing, empty cells as blank space), so it looks exactly like the page being edited,
   * and the cells stretch to fill the room. Without it a playing page drops its empty rows and columns.
   */
  keepsGrid?: boolean;
  /** Draws the pager outside the deck (after it) instead of under the keys. */
  renderPager?: (pager: PagerControls) => ReactNode;
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
  strip,
  variant = "full",
  volumes = null,
  compact = false,
  keepsGrid = false,
  renderPager,
}: BoardPlayerProps) {
  const t = useT();
  const descriptionPrefix = useId();
  // The phrase key tapped last; it shows as speaking for as long as speech plays.
  const [spoken, setSpoken] = useState<{ boardId: string; slot: number } | null>(null);
  const [menuSlot, setMenuSlot] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  // A slot whose control should take focus once it renders (the + left by a deleted key).
  const [focusSlot, setFocusSlot] = useState<number | null>(null);
  const slotButtons = useRef(new Map<number, HTMLElement>());
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  // The touch resting on a key: `held` once its long press fired, `moving` once it then dragged the key.
  const touch = useRef<{ slot: number; x: number; y: number; held: boolean; moving: boolean } | null>(null);
  const [movingSlot, setMovingSlot] = useState<number | null>(null);
  const gridElement = useRef<HTMLOListElement>(null);
  // Only where the page of keys never scrolls: a movable key takes over its touch gestures (touch-action).
  const canTouchMove = onMoveKey !== undefined && variant === "full";
  // The click that ends a long press must not run the key.
  const swallowClick = useRef(false);
  const canDrag = useMediaQuery(FINE_POINTER_QUERY) && onMoveKey !== undefined;
  const canEdit = onEditKey !== undefined;
  // Phones held upright draw the page transposed (display only); the dock always draws it as stored.
  const isPortraitBoard = useMediaQuery(PORTRAIT_BOARD_QUERY) && variant === "full";
  // An empty page opened past the last one; it becomes a real page once a key is added there.
  const [newPage, setNewPage] = useState<{ boardId: string; page: number } | null>(null);

  const { board, position } = navigation;
  const pageCount = board ? boardPageCount(board) : 1;
  const showsNewPage = canEdit && board !== null && newPage?.boardId === board.id && newPage.page === pageCount;
  const page = showsNewPage ? pageCount : (position?.page ?? 0);
  // Keys per page: the board's columns × rows.
  const pageSize = board ? keysPerPage(board) : 0;
  // Cells covered by a key spanning several cells: not drawn, never offered for a new key.
  const covered = board ? coveredSlots(board) : new Set<number>();
  // Keys this kind of board no longer shows (kept as stored): drawn as blank places, never offered for a new key.
  const hidden = new Set(board ? hiddenKeySlots(board) : []);
  const keys = board ? keysOnPage(board, page).map((key, index) => (hidden.has(page * pageSize + index) ? undefined : key)) : [];
  // One + per page; others (the inspector's Add key) add at the same slot.
  const plusIndex = addIndexOnPage(keys.map((key, index) => key !== undefined || covered.has(page * pageSize + index) || hidden.has(page * pageSize + index)));
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

  const isTransposed = isPortraitBoard && board.columns !== board.rows;
  const cellIndexes = displayedCellIndexes(board.columns, board.rows, isTransposed);
  // Playing on a phone: the editing tools go away (and, unless the page keeps its whole grid, its empty cells).
  const isPlaying = compact && !canEdit;
  // There the volume keys leave the grid for the mixer, so their cells count as free.
  const gridKeys = isPlaying ? keys.map((key) => (isVolumeKey(key) ? undefined : key)) : keys;
  const mixerKeys: VolumeKeyOnBoard[] = isPlaying ? keys.flatMap((key, index) => (isVolumeKey(key) ? [{ key, slot: page * pageSize + index }] : [])) : [];
  // A playing page drops its empty cells, rows and columns, unless it keeps the board's whole grid (Voice on a phone).
  const dropsEmpty = isPlaying && !keepsGrid;
  const extent = dropsEmpty ? usedExtent(gridKeys, board.columns) : { columns: board.columns, rows: board.rows };
  // The page's drawn columns and rows; its box reads them too, to keep room for keys large enough to use.
  const gridSize = { "--grid-columns": isTransposed ? extent.rows : extent.columns, "--grid-rows": isTransposed ? extent.columns : extent.rows } as CSSProperties;
  const shownPageCount = Math.max(pageCount, page + 1);
  // Past the last page, "next" opens a new one for editors, up to the board limit.
  const opensNewPage = canEdit && page >= shownPageCount - 1 && shownPageCount < MAX_BOARD_PAGES;
  // While playing on a phone a single page needs no pager; its arrows would only take room.
  const showsPager = !renderPager && (!compact || canEdit || shownPageCount > 1);

  const goToPage = (next: number) => {
    setNewPage(null);
    navigation.go({ boardId: board.id, page: next });
  };
  const openNewPage = () => {
    // Saved as the position too, so the page stays once its first key makes it real.
    navigation.go({ boardId: board.id, page: pageCount });
    setNewPage({ boardId: board.id, page: pageCount });
  };

  const slotRef = (slot: number) => (element: HTMLElement | null) => {
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

  /** The slot of the cell under a point of the screen, or null outside the grid. */
  const slotAtPoint = (x: number, y: number): number | null => {
    const cell = typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y)?.closest("[data-slot]") : null;
    if (!cell || !gridElement.current?.contains(cell)) return null;
    const slot = Number(cell.getAttribute("data-slot"));
    return Number.isInteger(slot) ? slot : null;
  };

  /** Ends a touch move without moving anything; the touch itself may still be down. */
  const cancelTouchMove = () => {
    touch.current = null;
    setMovingSlot(null);
    setDropSlot(null);
  };

  // A folder's Back key stays where it is: no menu, no moving it, nothing dropped on it.
  const isFixedSlot = (slot: number) => isFolderBoard(board) && slot === FOLDER_BACK_SLOT;

  // A volume key's Mute and Monitor buttons: they run OBS actions straight away, also where the deck is read-only.
  const volumeToggles = (inputName: string) => {
    const state = context.obs?.state;
    return {
      muted: state?.mutedInputs.includes(inputName) ?? false,
      // An older desktop does not report monitoring: the button shows it off.
      monitored: state?.monitoredInputs?.includes(inputName) ?? false,
      onToggleMute: () => onRun({ type: "obs.toggleMute", inputName }),
      onToggleMonitor: () => onRun({ type: "obs.toggleMonitor", inputName }),
    };
  };

  const keyMenuHandlers = (slot: number) =>
    canEdit && !isFixedSlot(slot)
      ? {
          onContextMenu: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            // A touch still resting on the key (Android's long press) ends in a click that must not run it.
            if (longPress.current) swallowClick.current = true;
            // That long press holds the key like ours does, so dragging on from it moves the key too.
            if (touch.current) touch.current.held = true;
            openMenu(slot);
          },
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
              event.preventDefault();
              openMenu(slot);
            }
          },
          onPointerDown: (event: PointerEvent<HTMLElement>) => {
            swallowClick.current = false;
            cancelLongPress();
            if (event.pointerType === "mouse") return;
            const held = { slot, x: event.clientX, y: event.clientY, held: false, moving: false };
            touch.current = held;
            const timer = setTimeout(() => {
              swallowClick.current = true;
              held.held = true;
              openMenu(slot);
            }, LONG_PRESS_MS);
            longPress.current = { timer, x: event.clientX, y: event.clientY };
          },
          onPointerMove: (event: PointerEvent<HTMLElement>) => {
            const start = longPress.current;
            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP) {
              cancelLongPress();
              touch.current = null;
            }
            const held = touch.current;
            if (!canTouchMove || !held?.held) return;
            if (!held.moving) {
              if (Math.hypot(event.clientX - held.x, event.clientY - held.y) <= TOUCH_MOVE_THRESHOLD) return;
              // The key is lifted: its menu gives way, and the touch stays with the key wherever it goes.
              held.moving = true;
              setMenuSlot(null);
              setMovingSlot(held.slot);
              try {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                navigator.vibrate?.(10);
              } catch {
                // Neither is needed to move the key.
              }
            }
            const over = slotAtPoint(event.clientX, event.clientY);
            // Leaving the grid drops the move.
            if (over === null) cancelTouchMove();
            else setDropSlot(over === held.slot || isFixedSlot(over) ? null : over);
          },
          onPointerUp: (event: PointerEvent<HTMLElement>) => {
            cancelLongPress();
            const held = touch.current;
            touch.current = null;
            if (!held?.moving) return;
            const to = slotAtPoint(event.clientX, event.clientY);
            setMovingSlot(null);
            setDropSlot(null);
            if (to !== null && to !== held.slot && !isFixedSlot(to)) void onMoveKey?.(held.slot, to);
          },
          onPointerCancel: () => {
            cancelLongPress();
            cancelTouchMove();
          },
          // A finger that slides off before the long press fires is not pressing the key any more.
          onPointerLeave: () => {
            cancelLongPress();
            if (!touch.current?.held) touch.current = null;
          },
        }
      : {};

  const dropHandlers = (slot: number) =>
    canDrag && !isFixedSlot(slot)
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
    onRun(key.action, { boardId: board.id, slot });
  };

  // The grid's own box, so wide layouts can size the keys to the room it gets.
  const gridArea = (
    <div className="deck-grid-area" style={gridSize}>
      <ol
        ref={gridElement}
        className={canTouchMove ? "deck-grid deck-grid-movable" : "deck-grid"}
        aria-label={t("board.keys", { board: board.name })}
        data-layout={compact && keepsGrid ? "whole" : undefined}
        style={gridSize}
      >
        {/* Cells in the order they are drawn, so reading order follows the screen; names keep the real position. */}
        {cellIndexes.map((index) => {
          const key = gridKeys[index];
          const slot = page * pageSize + index;
          if (covered.has(slot)) return null;
          const dropClass = dropSlot === slot ? "deck-key-drop" : "";
          if (!key) {
            if (dropsEmpty) return null;
            return (
              <li key={slot} data-slot={slot}>
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
                  <div className={["deck-key-blank", dropClass].filter(Boolean).join(" ")} aria-hidden="true" {...dropHandlers(slot)} />
                )}
              </li>
            );
          }
          const label = keyLabel(key, context.boards, t);
          const presentation = presentKey(key.action, context, { boardId: board.id, slot });
          const isFixed = isFixedSlot(slot);
          const isMovable = canDrag && !isFixed;
          const disabled = presentation.disabledReason !== undefined;
          const reason = presentation.disabledReason ? t(presentation.disabledReason) : undefined;
          const stateLabel = presentation.state && KEY_STATE_LABELS[presentation.state];
          const speaking = isSpeaking && spoken?.boardId === board.id && spoken.slot === slot;
          // Why the key is offline, or that it is being said: hidden text the key points to.
          const description = reason ?? (speaking ? t("key.speaking") : undefined);
          const descriptionId = `${descriptionPrefix}-${slot}`;
          // Without the empty cells every key needs its own place to stay where it is on the board.
          const placement = cellPlacement(index, key, board.columns, isTransposed, dropsEmpty);
          const cellClass = [canEdit ? "deck-slot" : "", placement ? "deck-cell-span" : ""].filter(Boolean).join(" ") || undefined;
          const menu = canEdit && !isFixed && (
            <>
              {/* A visible way into the menu for mouse users; keyboards use Shift+F10 on the key itself. */}
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
              {menuSlot === slot && onEditKey && (
                <KeyMenu
                  slot={slot}
                  label={label}
                  isFolder={key.action.type === "nav.openFolder"}
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
            </>
          );
          if (key.action.type === "obs.inputVolume") {
            const span = keySpanOf(key);
            const { onKeyDown, ...handleHandlers } = keyMenuHandlers(slot);
            return (
              <li key={slot} data-slot={slot} className={cellClass} style={placement}>
                <VolumeKey
                  ref={slotRef(slot)}
                  label={label}
                  inputName={key.action.inputName}
                  iconId={keyLook(key).iconId}
                  color={key.color}
                  vertical={isTransposed ? span.columns > span.rows : span.rows > span.columns}
                  {...volumeToggles(key.action.inputName)}
                  disabledReason={reason}
                  services={volumes}
                  selected={selectedSlot === slot}
                  className={[dropClass, movingSlot === slot ? "deck-key-moving" : ""].filter(Boolean).join(" ") || undefined}
                  onSliderKeyDown={onKeyDown}
                  handleProps={{
                    ...handleHandlers,
                    draggable: canDrag || undefined,
                    onDragStart: canDrag
                      ? (event) => {
                          cancelLongPress();
                          setMenuSlot(null);
                          event.dataTransfer.setData(SLOT_DRAG_TYPE, String(slot));
                          event.dataTransfer.effectAllowed = "move";
                        }
                      : undefined,
                  }}
                  dropProps={dropHandlers(slot)}
                />
                {menu}
              </li>
            );
          }
          return (
            <li key={slot} data-slot={slot} className={cellClass} style={placement}>
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
                className={[dropClass, movingSlot === slot ? "deck-key-moving" : ""].filter(Boolean).join(" ") || undefined}
                aria-keyshortcuts={canEdit && !isFixed ? "Shift+F10" : undefined}
                onClick={() => press(slot, key, disabled)}
                draggable={isMovable || undefined}
                onDragStart={
                  isMovable
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
              {menu}
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
  );

  // The outside pager: back while not on the first page, on while a later page has keys, else a new page.
  const realPageCount = boardPageCount(board);
  const pager: PagerControls = {
    page,
    count: shownPageCount,
    onPrevious: page > 0 ? () => goToPage(page - 1) : undefined,
    onNext: page < realPageCount - 1 ? () => goToPage(page + 1) : undefined,
    onNewPage: page === realPageCount - 1 && realPageCount < MAX_BOARD_PAGES ? openNewPage : undefined,
  };

  const deck = (
    <section
      className={[
        "deck",
        `deck-${variant}`,
        strip ? "deck-with-strip" : "",
        compact ? "deck-compact" : "",
        compact && !canEdit ? "deck-playing" : "",
        compact && keepsGrid ? "deck-whole" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={board.name}
    >
      {toolbar && <div className="deck-header">{toolbar}</div>}
      {strip && <div className="deck-strip">{strip}</div>}

      {mixerKeys.length > 0 ? (
        // The faders beside the keys (under them when upright), like a mixer next to a deck.
        <div className={isPortraitBoard ? "deck-stage deck-stage-upright" : "deck-stage"}>
          {gridArea}
          <div className="deck-mixer" role="group" aria-label={t("deck.mixer")}>
            {mixerKeys.map(({ key, slot }) => {
              const presentation = presentKey(key.action, context, { boardId: board.id, slot });
              return (
                <VolumeKey
                  key={slot}
                  label={keyLabel(key, context.boards, t)}
                  inputName={key.action.inputName}
                  iconId={keyLook(key).iconId}
                  color={key.color}
                  vertical={!isPortraitBoard}
                  {...volumeToggles(key.action.inputName)}
                  disabledReason={presentation.disabledReason ? t(presentation.disabledReason) : undefined}
                  services={volumes}
                />
              );
            })}
          </div>
        </div>
      ) : (
        gridArea
      )}

      {showsPager && (
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
          <span className={variant === "full" ? "deck-page visually-hidden" : "deck-page"} aria-live="polite">
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
      )}
    </section>
  );

  return renderPager ? (
    <>
      {deck}
      {renderPager(pager)}
    </>
  ) : (
    deck
  );
}
