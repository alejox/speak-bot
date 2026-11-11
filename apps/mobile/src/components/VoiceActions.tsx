import { PenLine, Square } from "lucide-react";
import { useT } from "../i18n/I18nProvider";

const ICON_SIZE = 22;

interface VoiceActionsProps {
  isSpeaking: boolean;
  onWrite: () => void;
  onStop: () => void;
}

/**
 * Presentational: the Voice space's actions on a phone, in the corner beside the keys (never over them):
 * Write opens the composer sheet, and Stop shows only while speech is playing.
 */
export function VoiceActions({ isSpeaking, onWrite, onStop }: VoiceActionsProps) {
  const t = useT();
  return (
    <div className="voice-actions">
      {isSpeaking && (
        <button type="button" className="button voice-action voice-action-stop" onClick={onStop}>
          <Square size={ICON_SIZE} aria-hidden="true" focusable="false" />
          <span className="voice-action-label">{t("composer.stop")}</span>
        </button>
      )}
      <button type="button" className="button button-primary voice-action" onClick={onWrite}>
        <PenLine size={ICON_SIZE} aria-hidden="true" focusable="false" />
        <span className="voice-action-label">{t("composer.write")}</span>
      </button>
    </div>
  );
}
