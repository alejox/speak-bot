import { ChevronLeft, ChevronRight, PenLine, Plus, Square, SquarePen } from "lucide-react";
import { useT } from "../i18n/I18nProvider";
import type { PagerControls } from "./BoardPlayer";

const ICON_SIZE = 22;

interface VoiceActionsProps {
  isSpeaking: boolean;
  onWrite: () => void;
  onStop: () => void;
  /** The board's pages: back, on (or a new page on the last one), right before Write. */
  pager?: PagerControls;
  /** The Edit keys toggle, first in the column; absent where the keys cannot be edited. */
  editKeys?: { isEditing: boolean; onChange: (isEditing: boolean) => void };
}

/**
 * Presentational: the Voice space's actions on a phone, in the corner beside the keys (never over them):
 * Edit keys, Stop while speech is playing, the page buttons, then Write, which opens the composer sheet.
 */
export function VoiceActions({ isSpeaking, onWrite, onStop, pager, editKeys }: VoiceActionsProps) {
  const t = useT();
  return (
    <div className="voice-actions" role="group" aria-label={t("voice.actions")}>
      {pager && (
        <span className="visually-hidden" aria-live="polite">
          {t("board.page", { page: pager.page + 1, count: pager.count })}
        </span>
      )}
      {editKeys && (
        <button
          type="button"
          className="button voice-action voice-action-page voice-action-edit"
          aria-label={t("deck.editKeys")}
          aria-pressed={editKeys.isEditing}
          title={t("deck.editKeys")}
          onClick={() => editKeys.onChange(!editKeys.isEditing)}
        >
          <SquarePen size={ICON_SIZE} aria-hidden="true" focusable="false" />
        </button>
      )}
      {isSpeaking && (
        <button type="button" className="button voice-action voice-action-stop" onClick={onStop}>
          <Square size={ICON_SIZE} aria-hidden="true" focusable="false" />
          <span className="voice-action-label">{t("composer.stop")}</span>
        </button>
      )}
      {pager?.onPrevious && (
        <button type="button" className="button voice-action voice-action-page" aria-label={t("board.previous")} onClick={pager.onPrevious}>
          <ChevronLeft size={ICON_SIZE} aria-hidden="true" focusable="false" />
        </button>
      )}
      {pager?.onNext ? (
        <button type="button" className="button voice-action voice-action-page" aria-label={t("board.next")} onClick={pager.onNext}>
          <ChevronRight size={ICON_SIZE} aria-hidden="true" focusable="false" />
        </button>
      ) : (
        pager?.onNewPage && (
          <button type="button" className="button voice-action voice-action-page" aria-label={t("board.addPage")} onClick={pager.onNewPage}>
            <Plus size={ICON_SIZE} aria-hidden="true" focusable="false" />
          </button>
        )
      )}
      <button type="button" className="button button-primary voice-action" onClick={onWrite}>
        <PenLine size={ICON_SIZE} aria-hidden="true" focusable="false" />
        <span className="voice-action-label">{t("composer.write")}</span>
      </button>
    </div>
  );
}
