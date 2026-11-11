import { folderPath, type Board } from "@speed-deck/core";
import { useT } from "../i18n/I18nProvider";

interface FolderBreadcrumbProps {
  /** The folder on screen. */
  board: Board;
  /** Every board, to find the boards the folder is in. */
  boards: readonly Board[];
}

/** Where a folder is, e.g. "Deck › Scenes", in place of the board pill while the folder is open. */
export function FolderBreadcrumb({ board, boards }: FolderBreadcrumbProps) {
  const t = useT();
  const path = folderPath(boards, board.id);
  return (
    <nav className="folder-path" aria-label={t("board.folderPath")}>
      <ol>
        {path.map((step, index) => (
          <li key={step.id} aria-current={index === path.length - 1 ? "location" : undefined}>
            {index > 0 && (
              <span className="folder-path-separator" aria-hidden="true">
                {" › "}
              </span>
            )}
            {step.name}
          </li>
        ))}
      </ol>
    </nav>
  );
}
