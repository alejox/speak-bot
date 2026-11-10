import {
  ACTION_REGISTRY,
  boardPageCount,
  isActionType,
  keysOnPage,
  KEYS_PER_PAGE,
  MAX_BOARD_PAGES,
  type Action,
  type ActionType,
  type Board,
  type UiLanguage,
} from "@speed-deck/core";
import { useId, useState, type DragEvent } from "react";
import type { ObsServices } from "../app/composition-root";
import { keyIconId, keyLabel, presentKey, type KeyContext } from "../app/key-presentation";
import type { BoardNavigation, Boards } from "../app/use-boards";
import { useT } from "../i18n/I18nProvider";
import type { Message, MessageKey } from "../i18n/messages";
import { ACTION_DRAG_TYPE, ActionLibrary } from "./ActionLibrary";
import { BoardKey } from "./BoardKey";
import { BoardList } from "./BoardList";
import { KeyEditorForm } from "./KeyEditorForm";

/** Drag data type of a key being moved to another slot. */
const SLOT_DRAG_TYPE = "application/x-speed-deck-slot";

interface BoardEditorProps {
  boards: Boards;
  navigation: BoardNavigation;
  context: KeyContext;
  obs: ObsServices | null;
  language: UiLanguage;
  /** Runs an action for "Test"; called synchronously inside the tap. */
  onTest: (action: Action) => void;
  /** The current status message, shown in the editor's live region. */
  statusText: string;
  report: (message: Message | null) => void;
}

/** An action chosen in the library for a slot, waiting for its parameters. */
interface Assignment {
  slot: number;
  type: ActionType;
  /** Changes on every assignment so the key editor starts over. */
  serial: number;
}

/**
 * The desktop board editor: boards on the left, the key grid with pages in the middle, the action
 * library and the key editor on the right. Drag and drop always has a keyboard alternative: select a key,
 * then "Assign" an action or "Move" the key.
 */
export function BoardEditor({ boards: boardsState, navigation, context, obs, language, onTest, statusText, report }: BoardEditorProps) {
  const t = useT();
  const gridLabelId = useId();
  const { boards, change } = boardsState;
  const board = navigation.board;
  const [page, setPage] = useState(navigation.position?.page ?? 0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  if (!board) return null;
  const pageCount = boardPageCount(board);
  // One page past the last is always open, so a new page is a click away, up to the board limit.
  const lastPage = Math.min(pageCount, MAX_BOARD_PAGES - 1);
  const current = Math.min(page, lastPage);
  const opensNewPage = current >= pageCount - 1 && current < lastPage;
  const keys = keysOnPage(board, current);
  const selectedKey = selectedSlot === null ? undefined : board.keys.find((key) => key.slot === selectedSlot);

  const selectBoard = (boardId: string) => {
    navigation.go({ boardId, page: 0 });
    setPage(0);
    setSelectedSlot(null);
    setAssignment(null);
  };

  const showSlot = (slot: number) => {
    setSelectedSlot(slot);
    setPage(Math.floor(slot / KEYS_PER_PAGE));
  };

  const assign = async (slot: number, type: ActionType) => {
    showSlot(slot);
    const existing = board.keys.find((key) => key.slot === slot);
    if (ACTION_REGISTRY[type].params.length > 0) {
      setAssignment((previous) => ({ slot, type, serial: (previous?.serial ?? 0) + 1 }));
      report({ key: "editor.assigned", params: { action: t(ACTION_REGISTRY[type].labelKey as MessageKey), number: slot + 1 } });
      return;
    }
    // Actions without parameters are saved right away; the key keeps its label, icon and color.
    setAssignment(null);
    const kept = { label: existing?.label, icon: existing?.icon, color: existing?.color ?? "" };
    await change(
      (store) => store.setKey(board.id, { slot, ...kept, action: { type } as Action }, { replace: true }),
      () => ({ key: "editor.saved" }),
    );
  };

  const move = async (from: number, to: number): Promise<boolean> => {
    if (from === to) return true;
    const moved = await change(
      (store) => store.moveKey(board.id, from, to),
      () => ({ key: "editor.moved", params: { number: to + 1 } }),
    );
    if (moved === undefined) return false;
    setAssignment(null);
    showSlot(to);
    return true;
  };

  const drop = (event: DragEvent, slot: number) => {
    event.preventDefault();
    setDropSlot(null);
    const type = event.dataTransfer.getData(ACTION_DRAG_TYPE);
    const from = event.dataTransfer.getData(SLOT_DRAG_TYPE);
    if (isActionType(type)) void assign(slot, type);
    else if (from !== "") void move(Number(from), slot);
  };

  return (
    <div className="board-editor">
      <BoardList
        boards={boards}
        selectedId={board.id}
        onSelect={selectBoard}
        onCreate={() =>
          change(
            (store) => store.create(t("boards.defaultName", { number: boards.length + 1 })),
            (created) => ({ key: "boards.created", params: { name: created.name } }),
          )
        }
        onRename={async (target, name) =>
          (await change((store) => store.rename(target.id, name), (renamed) => ({ key: "boards.renamed", params: { name: renamed.name } }))) !==
          undefined
        }
        onDelete={async (target) =>
          (await change(
            async (store) => {
              await store.remove(target.id);
              return true;
            },
            () => ({ key: "boards.deleted", params: { name: target.name } }),
          )) === true
        }
        onRestore={async () => {
          const restored = await change((store) => store.restoreDefault(language), () => ({ key: "boards.restored" }));
          if (restored) selectBoard(restored.id);
        }}
      />

      <section className="board-editor-grid" aria-labelledby={gridLabelId}>
        <h3 id={gridLabelId}>{board.name}</h3>
        <p className="deck-hint">{t("editor.hint")}</p>
        <p className="status editor-status" role="status" aria-live="polite">
          {statusText}
        </p>
        <ol className="deck-grid deck-grid-editing" aria-label={t("board.keys", { board: board.name })}>
          {keys.map((key, index) => {
            const slot = current * KEYS_PER_PAGE + index;
            const isSelected = slot === selectedSlot;
            const dropProps = {
              onDragOver: (event: DragEvent) => {
                event.preventDefault();
                setDropSlot(slot);
              },
              onDragLeave: () => setDropSlot((value) => (value === slot ? null : value)),
              onDrop: (event: DragEvent) => drop(event, slot),
            };
            const dropClass = dropSlot === slot ? "deck-key-drop" : "";
            if (!key) {
              return (
                <li key={slot}>
                  <button
                    type="button"
                    className={`deck-key deck-key-empty ${isSelected ? "deck-key-selected" : ""} ${dropClass}`}
                    aria-label={t("board.addKey", { number: slot + 1 })}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setAssignment(null);
                      setSelectedSlot(slot);
                    }}
                    {...dropProps}
                  >
                    <span className="deck-key-plus" aria-hidden="true">
                      +
                    </span>
                  </button>
                </li>
              );
            }
            const label = keyLabel(key, boards, t);
            const presentation = presentKey(key.action, context);
            return (
              <li key={slot}>
                <BoardKey
                  label={label}
                  iconId={keyIconId(key)}
                  color={key.color}
                  detail={presentation.detail ? t(presentation.detail.key, presentation.detail.params) : undefined}
                  selected={isSelected}
                  className={dropClass}
                  aria-label={t("board.editKey", { number: slot + 1, label })}
                  aria-pressed={isSelected}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(SLOT_DRAG_TYPE, String(slot));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => {
                    setAssignment(null);
                    setSelectedSlot(slot);
                  }}
                  {...dropProps}
                />
              </li>
            );
          })}
        </ol>
        <div className="deck-pager">
          <button type="button" className="button button-small" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label={t("board.previous")}>
            <span aria-hidden="true">‹</span>
          </button>
          <span className="deck-page" aria-live="polite">
            {t("board.page", { page: current + 1, count: Math.max(pageCount, current + 1) })}
          </span>
          <button
            type="button"
            className="button button-small"
            onClick={() => setPage(current + 1)}
            disabled={current >= lastPage}
            aria-label={opensNewPage ? t("editor.addPage") : t("board.next")}
          >
            <span aria-hidden="true">{opensNewPage ? "+" : "›"}</span>
          </button>
        </div>
        <section className="key-editor-panel" aria-label={selectedSlot === null ? t("editor.noSelection") : t("editor.keyTitle", { number: selectedSlot + 1 })}>
          {selectedSlot === null ? (
            <p className="empty">{t("editor.noSelection")}</p>
          ) : (
            <>
              <h3>{selectedKey ? t("editor.keyTitle", { number: selectedSlot + 1 }) : t("editor.newKeyTitle", { number: selectedSlot + 1 })}</h3>
              <KeyEditorForm
                key={`${board.id}:${selectedSlot}:${assignment?.slot === selectedSlot ? assignment.serial : 0}:${selectedKey ? "key" : "empty"}`}
                slot={selectedSlot}
                existing={selectedKey}
                assignedType={assignment?.slot === selectedSlot ? assignment.type : undefined}
                boards={boards}
                obs={obs}
                onTest={onTest}
                onSave={async (input) => {
                  const saved = await change((store) => store.setKey(board.id, input, { replace: selectedKey !== undefined }), () => ({ key: "editor.saved" }));
                  if (saved) setAssignment(null);
                  return saved !== undefined;
                }}
                onDelete={async () =>
                  (await change(
                    async (store) => {
                      await store.clearKey(board.id, selectedSlot);
                      return true;
                    },
                    () => ({ key: "editor.deleted" }),
                  )) === true
                }
                onMove={(to) => move(selectedSlot, to)}
              />
            </>
          )}
        </section>
      </section>

      <div className="board-editor-side">
        <ActionLibrary selectedSlot={selectedSlot} onAssign={(type) => selectedSlot !== null && void assign(selectedSlot, type)} />
      </div>
    </div>
  );
}
