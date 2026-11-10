import { DEFAULT_BOARD_NAMES, DEFAULT_DECK_BOARD_ID, DEFAULT_DECK_BOARD_NAMES, MAX_BOARD_NAME_LENGTH, type Board, type UiLanguage } from "@speed-deck/core";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Boards } from "../app/use-boards";
import { useT } from "../i18n/I18nProvider";
import { Menu, useOutsidePress } from "./Menu";
import { ModalDialog } from "./ModalDialog";

interface BoardMenuProps {
  /** The board shown; new boards take its kind. */
  board: Board;
  boards: Boards;
  language: UiLanguage;
  /** Shows another board (a new or restored one). */
  onSelect: (boardId: string) => void;
  /** The current status message, repeated in the dialogs' live region. */
  statusText: string;
}

type Task = "create" | "rename" | "delete" | "restore";

/** The board's own menu, next to the board selector: new board, rename, delete and restore the built-in board. */
export function BoardMenu({ board, boards: boardsState, language, onSelect, statusText }: BoardMenuProps) {
  const t = useT();
  const { boards, change } = boardsState;
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const isLast = boards.length <= 1;
  const defaultName = (board.kind === "deck" ? DEFAULT_DECK_BOARD_NAMES : DEFAULT_BOARD_NAMES)[language];

  useOutsidePress(popover, () => setIsOpen(false));

  const close = () => {
    setIsOpen(false);
    button.current?.focus();
  };
  // Focus is on the menu button when a dialog opens, so the dialog gives it back there.
  const start = (next: Task) => {
    close();
    setTask(next);
  };

  const finish = (done: boolean) => {
    if (done) setTask(null);
  };

  const dialogs: Record<Task, ReactNode> = {
    create: (
      <NameDialog
        title={t("boards.create")}
        initialName={t("boards.defaultName", { number: boards.length + 1 })}
        submitLabel={t("boards.createYes")}
        statusText={statusText}
        onClose={() => setTask(null)}
        onSubmit={async (name) => {
          const created = await change(
            (store) => store.create(name, board.kind),
            (fresh) => ({ key: "boards.created", params: { name: fresh.name } }),
          );
          if (created) onSelect(created.id);
          finish(created !== undefined);
        }}
      />
    ),
    rename: (
      <NameDialog
        title={t("boards.renameTitle", { name: board.name })}
        initialName={board.name}
        submitLabel={t("boards.save")}
        statusText={statusText}
        onClose={() => setTask(null)}
        onSubmit={async (name) => {
          const renamed = await change(
            (store) => store.rename(board.id, name),
            (fresh) => ({ key: "boards.renamed", params: { name: fresh.name } }),
          );
          finish(renamed !== undefined);
        }}
      />
    ),
    delete: (
      <ConfirmDialog
        title={t("boards.deleteTitle", { name: board.name })}
        prompt={t("boards.deleteConfirm", { name: board.name })}
        confirmLabel={t("boards.deleteYes")}
        cancelLabel={t("boards.deleteNo")}
        statusText={statusText}
        onClose={() => setTask(null)}
        onConfirm={async () => {
          const deleted = await change(
            async (store) => {
              await store.remove(board.id);
              return true;
            },
            () => ({ key: "boards.deleted", params: { name: board.name } }),
          );
          finish(deleted === true);
        }}
      />
    ),
    restore: (
      <ConfirmDialog
        title={t("boards.restore")}
        prompt={t("boards.restoreConfirm", { name: defaultName })}
        confirmLabel={t("boards.restoreYes")}
        cancelLabel={t("boards.restoreNo")}
        statusText={statusText}
        onClose={() => setTask(null)}
        onConfirm={async () => {
          // Without a board id the store restores the built-in voice board.
          const restored = await change(
            (store) => store.restoreDefault(language, board.kind === "deck" ? DEFAULT_DECK_BOARD_ID : undefined),
            (fresh) => ({ key: "boards.restored", params: { name: fresh.name } }),
          );
          if (restored) onSelect(restored.id);
          finish(restored !== undefined);
        }}
      />
    ),
  };

  return (
    <div ref={popover} className="board-menu">
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label={t("boards.menu")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="popover board-menu-popover">
          <Menu
            label={t("boards.menu")}
            items={[
              { label: t("boards.create"), onSelect: () => start("create") },
              { label: t("boards.rename"), onSelect: () => start("rename") },
              { label: t("boards.delete"), onSelect: () => start("delete"), disabled: isLast, description: isLast ? t("boards.lastBoard") : undefined },
              { label: t("boards.restore"), onSelect: () => start("restore") },
            ]}
            onClose={close}
          />
        </div>
      )}
      {task && dialogs[task]}
    </div>
  );
}

interface NameDialogProps {
  title: string;
  initialName: string;
  submitLabel: string;
  statusText: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

function NameDialog({ title, initialName, submitLabel, statusText, onSubmit, onClose }: NameDialogProps) {
  const t = useT();
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [isBusy, setIsBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "" || isBusy) return;
    setIsBusy(true);
    void onSubmit(name.trim()).finally(() => setIsBusy(false));
  };

  return (
    <ModalDialog title={title} onClose={onClose} statusText={statusText} className="modal-small">
      <form className="modal-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={inputId}>{t("boards.name")}</label>
          <input id={inputId} value={name} maxLength={MAX_BOARD_NAME_LENGTH} autoComplete="off" onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            {t("boards.cancel")}
          </button>
          <button type="submit" className="button button-primary" disabled={name.trim() === "" || isBusy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

interface ConfirmDialogProps {
  title: string;
  prompt: string;
  confirmLabel: string;
  cancelLabel: string;
  statusText: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Asks before something that cannot be undone; the safe choice has focus. */
function ConfirmDialog({ title, prompt, confirmLabel, cancelLabel, statusText, onConfirm, onClose }: ConfirmDialogProps) {
  const [isBusy, setIsBusy] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <ModalDialog title={title} onClose={onClose} statusText={statusText} className="modal-small">
      <p className="modal-prompt">{prompt}</p>
      <div className="modal-actions">
        <button ref={keep} type="button" className="button" data-autofocus onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className="button button-danger-text"
          disabled={isBusy}
          onClick={() => {
            setIsBusy(true);
            void onConfirm().finally(() => setIsBusy(false));
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalDialog>
  );
}
