import { MAX_BOARD_COLUMNS, MAX_BOARD_ROWS, MIN_BOARD_COLUMNS, MIN_BOARD_ROWS, type Board } from "@speed-deck/core";
import { Grid3x3 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import type { Boards } from "../app/use-boards";
import { useT } from "../i18n/I18nProvider";
import { ModalDialog } from "./ModalDialog";

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
const COLUMN_CHOICES = range(MIN_BOARD_COLUMNS, MAX_BOARD_COLUMNS);
const ROW_CHOICES = range(MIN_BOARD_ROWS, MAX_BOARD_ROWS);

interface GridSizeButtonProps {
  /** The board shown; every board shares its grid. */
  board: Board;
  boards: Boards;
  /** The current status message, repeated in the dialog's live region (where a refusal shows). */
  statusText: string;
}

/** A grid icon beside the board pill: it opens a dialog that sets the columns and rows of every board. */
export function GridSizeButton({ board, boards, statusText }: GridSizeButtonProps) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-button grid-size-button" aria-label={t("grid.open")} aria-haspopup="dialog" onClick={() => setIsOpen(true)}>
        <Grid3x3 size={20} aria-hidden="true" />
      </button>
      {isOpen && <GridSizeDialog board={board} boards={boards} statusText={statusText} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function GridSizeDialog({ board, boards, statusText, onClose }: GridSizeButtonProps & { onClose: () => void }) {
  const t = useT();
  const ids = { columns: useId(), rows: useId(), hint: useId() };
  const [columns, setColumns] = useState(board.columns);
  const [rows, setRows] = useState(board.rows);
  const [isBusy, setIsBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    void boards
      .change(
        (store) => store.setGrid({ columns, rows }),
        () => ({ key: "grid.saved", params: { columns, rows } }),
      )
      .then((resized) => {
        setIsBusy(false);
        // A refusal keeps the dialog open; its message shows in the dialog's live region.
        if (resized) onClose();
      });
  };

  return (
    <ModalDialog title={t("grid.title")} onClose={onClose} statusText={statusText} className="modal-small">
      <form className="modal-form" onSubmit={submit} aria-describedby={ids.hint}>
        <div className="field">
          <label htmlFor={ids.columns}>{t("grid.columns")}</label>
          <select id={ids.columns} value={columns} onChange={(event) => setColumns(Number(event.target.value))}>
            {COLUMN_CHOICES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.rows}>{t("grid.rows")}</label>
          <select id={ids.rows} value={rows} onChange={(event) => setRows(Number(event.target.value))}>
            {ROW_CHOICES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <p id={ids.hint} className="field-hint">
          {t("grid.hint")}
        </p>
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            {t("grid.cancel")}
          </button>
          <button type="submit" className="button button-primary" disabled={isBusy}>
            {t("grid.save")}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
