import { MAX_BOARD_NAME_LENGTH, type Board } from "@speed-deck/core";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useT } from "../i18n/I18nProvider";
import { RestoreDefaults } from "./RestoreDefaults";

interface BoardListProps {
  boards: readonly Board[];
  selectedId: string;
  onSelect: (boardId: string) => void;
  /** Resolves with the new board, or undefined when it failed. */
  onCreate: () => Promise<Board | undefined>;
  onRename: (board: Board, name: string) => Promise<boolean>;
  onDelete: (board: Board) => Promise<boolean>;
  onRestore: () => Promise<void>;
}

/** The boards pane of the editor: pick, create, rename inline, delete after an inline confirmation, restore the default. */
export function BoardList({ boards, selectedId, onSelect, onCreate, onRename, onDelete, onRestore }: BoardListProps) {
  const t = useT();
  const headingId = useId();
  const lastBoardHint = useId();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isLast = boards.length <= 1;

  const create = async () => {
    const board = await onCreate();
    if (board) {
      onSelect(board.id);
      setRenamingId(board.id);
    }
  };

  return (
    <section className="board-list" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("boards.title")}</h3>
      <ul>
        {boards.map((board) => (
          <li key={board.id} className={board.id === selectedId ? "board-list-item board-list-item-selected" : "board-list-item"}>
            {renamingId === board.id ? (
              <RenameForm
                board={board}
                onSubmit={async (name) => {
                  if (await onRename(board, name)) setRenamingId(null);
                }}
                onCancel={() => setRenamingId(null)}
              />
            ) : deletingId === board.id ? (
              <DeleteConfirm
                board={board}
                onConfirm={async () => {
                  if (await onDelete(board)) setDeletingId(null);
                }}
                onCancel={() => setDeletingId(null)}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="board-list-name"
                  aria-current={board.id === selectedId ? "true" : undefined}
                  onClick={() => onSelect(board.id)}
                >
                  {board.name}
                </button>
                <div className="board-list-actions">
                  <button
                    type="button"
                    className="button button-small"
                    aria-label={t("boards.renameButtonLabel", { name: board.name })}
                    onClick={() => setRenamingId(board.id)}
                  >
                    {t("boards.rename")}
                  </button>
                  <button
                    type="button"
                    className="button button-small button-danger"
                    aria-label={t("boards.deleteLabel", { name: board.name })}
                    aria-disabled={isLast || undefined}
                    aria-describedby={isLast ? lastBoardHint : undefined}
                    title={isLast ? t("boards.lastBoard") : undefined}
                    onClick={() => !isLast && setDeletingId(board.id)}
                  >
                    {t("boards.delete")}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p id={lastBoardHint} hidden>
        {t("boards.lastBoard")}
      </p>
      <div className="board-list-footer">
        <button type="button" className="button button-small button-primary" onClick={() => void create()}>
          {t("boards.create")}
        </button>
        <RestoreDefaults onRestore={onRestore} />
      </div>
    </section>
  );
}

function RenameForm({ board, onSubmit, onCancel }: { board: Board; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(board.name);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() !== "") void onSubmit(name);
  };

  return (
    <form className="board-rename" onSubmit={submit}>
      <label htmlFor={inputId} className="visually-hidden">
        {t("boards.renameLabel", { name: board.name })}
      </label>
      <input
        id={inputId}
        ref={input}
        value={name}
        maxLength={MAX_BOARD_NAME_LENGTH}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="board-list-actions">
        <button type="submit" className="button button-small button-primary" disabled={name.trim() === ""}>
          {t("boards.save")}
        </button>
        <button type="button" className="button button-small" onClick={onCancel}>
          {t("boards.cancel")}
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({ board, onConfirm, onCancel }: { board: Board; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const promptId = useId();
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div className="board-delete-confirm" role="group" aria-labelledby={promptId}>
      <p id={promptId}>{t("boards.deleteConfirm", { name: board.name })}</p>
      <div className="board-list-actions">
        <button type="button" className="button button-small button-danger" onClick={() => void onConfirm()}>
          {t("boards.deleteYes")}
        </button>
        <button ref={keep} type="button" className="button button-small" onClick={onCancel}>
          {t("boards.deleteNo")}
        </button>
      </div>
    </div>
  );
}
