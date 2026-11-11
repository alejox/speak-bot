import { BOARD_GRID_RANGES, type Board } from "@speed-deck/core";
import { Grid3x3 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import type { Boards } from "../app/use-boards";
import { useT } from "../i18n/I18nProvider";
import { ModalDialog } from "./ModalDialog";

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);

interface GridSizeButtonProps {
  /** The board shown; every board of its kind shares its grid. */
  board: Board;
  boards: Boards;
  /** The current status message, repeated in the dialog's live region (where a refusal shows). */
  statusText: string;
}

/** A grid icon beside the board pill: it opens a dialog that sets the columns and rows of every board of the shown board's kind. */
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
  const { kind } = board;
  const limits = BOARD_GRID_RANGES[kind];
  const space = t(kind === "voice" ? "nav.voice" : "nav.deck");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    void boards
      .change(
        (store) => store.setGrid(kind, { columns, rows }),
        () => ({ key: "grid.saved", params: { columns, rows } }),
      )
      .then((resized) => {
        setIsBusy(false);
        // A refusal keeps the dialog open; its message shows in the dialog's live region.
        if (resized) onClose();
      });
  };

  return (
    <ModalDialog title={t("grid.title", { space })} onClose={onClose} statusText={statusText} className="modal-small">
      <form className="modal-form" onSubmit={submit} aria-describedby={ids.hint}>
        <div className="field">
          <label htmlFor={ids.columns}>{t("grid.columns")}</label>
          <select id={ids.columns} value={columns} onChange={(event) => setColumns(Number(event.target.value))}>
            {range(limits.minColumns, limits.maxColumns).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.rows}>{t("grid.rows")}</label>
          <select id={ids.rows} value={rows} onChange={(event) => setRows(Number(event.target.value))}>
            {range(limits.minRows, limits.maxRows).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <p id={ids.hint} className="field-hint">
          {t("grid.hint", { space })}
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
