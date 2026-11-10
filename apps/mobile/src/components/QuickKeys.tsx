import type { Board, Key } from "@speed-deck/core";
import { useId } from "react";
import { keyIconId, keyLabel } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import { BoardKey } from "./BoardKey";

/** How many speak keys of the current board the Speak section offers. */
export const QUICK_KEY_COUNT = 5;

/** The first keys of `board` that speak a text, in slot order. */
export function quickKeysOf(board: Board | null): Key[] {
  return (board?.keys ?? []).filter((key) => key.action.type === "voice.speak").slice(0, QUICK_KEY_COUNT);
}

interface QuickKeysProps {
  board: Board | null;
  boards: readonly Board[];
  /** Called synchronously inside the tap. */
  onPress: (key: Key) => void;
}

/** The first five speak keys of the current board, as small keys next to the composer. */
export function QuickKeys({ board, boards, onPress }: QuickKeysProps) {
  const t = useT();
  const headingId = useId();
  const keys = quickKeysOf(board);
  return (
    <section className="quick-keys" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("speak.quickKeys")}</h3>
      {keys.length === 0 ? (
        <p className="empty">{t("speak.noQuickKeys")}</p>
      ) : (
        <ul className="quick-grid">
          {keys.map((key) => (
            <li key={key.slot}>
              <BoardKey label={keyLabel(key, boards, t)} iconId={keyIconId(key)} color={key.color} size="small" onClick={() => onPress(key)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
