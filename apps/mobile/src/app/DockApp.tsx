import { useState } from "react";
import { DOCK_BOARD_POSITION_STORAGE_KEY, LocalStorageBoardPositionStore } from "../adapters/local-storage-board-position-store";
import { BoardMenu } from "../components/BoardMenu";
import { BoardPlayer } from "../components/BoardPlayer";
import { DockComposer } from "../components/DockComposer";
import { KeyEditorDialog } from "../components/KeyEditorDialog";
import { I18nProvider, useLanguage, useMessageText, useT } from "../i18n/I18nProvider";
import type { Message } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { useDeck } from "./use-deck";
import { useLanguagePreference } from "./use-language-preference";
import { useSpeech } from "./use-speech";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

/**
 * Container for the OBS Custom Browser Dock: a compact board player that always runs keys on the
 * computer, with its own board and page. Only useful when the desktop app serves the page.
 * The language follows the desktop live (settings-changed events) unless this dock chose one.
 */
export function DockApp({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services, { forceComputer: true });
  const { language } = useLanguagePreference(services.language, target);
  return (
    <I18nProvider language={language}>
      <div className="dock">
        {target.detection === "found" && target.isRemote ? <DockContent target={target} /> : <DockUnavailable target={target} />}
      </div>
    </I18nProvider>
  );
}

function DockUnavailable({ target }: { target: SpeechTarget }) {
  const t = useT();
  return (
    <p className="dock-message" role="status">
      {target.detection === "pending" ? t("dock.checking") : t("dock.noDesktop")}
    </p>
  );
}

function DockContent({ target }: { target: SpeechTarget }) {
  const t = useT();
  const language = useLanguage();
  const [status, setStatus] = useState<Message | null>(null);
  const statusText = useMessageText(status);
  const speech = useSpeech(target, language, setStatus);
  const [positionStore] = useState(() => new LocalStorageBoardPositionStore(DOCK_BOARD_POSITION_STORAGE_KEY));
  const deck = useDeck(target, speech, language, positionStore, setStatus);
  const [dialogSlot, setDialogSlot] = useState<number | null>(null);
  const [text, setText] = useState("");
  const board = deck.navigation.board;

  return (
    <main className="dock-main">
      <h1 className="visually-hidden">{t("app.title")}</h1>
      <DockComposer
        text={text}
        isSpeaking={speech.isSpeaking}
        onTextChange={setText}
        onSpeak={() => speech.speak(text)}
        onStop={speech.stop}
      />
      <p className="status" role="status" aria-live="polite">
        {statusText || (target.error ? t(target.error) : "")}
      </p>
      <BoardPlayer
        variant="dock"
        boards={deck.boards.boards}
        groupByKind
        navigation={deck.navigation}
        context={deck.context}
        onRun={deck.run}
        isSpeaking={speech.isSpeaking}
        onEditKey={setDialogSlot}
        onDeleteKey={deck.clearKey}
        onMoveKey={deck.moveKey}
        toolbar={
          board && (
            <BoardMenu
              board={board}
              boards={deck.boards}
              language={language}
              onSelect={(boardId) => deck.navigation.go({ boardId, page: 0 })}
              statusText={statusText}
            />
          )
        }
      />
      {dialogSlot !== null && board && (
        <KeyEditorDialog
          key={`${board.id}:${dialogSlot}`}
          slot={dialogSlot}
          existing={board.keys.find((key) => key.slot === dialogSlot)}
          boardKind={board.kind}
          boards={deck.boards.boards}
          obs={target.obs}
          onTest={deck.run}
          onSave={async (key) => {
            const saved = await deck.saveKey(key, board.keys.find((candidate) => candidate.slot === dialogSlot));
            if (saved) setDialogSlot(null);
            return saved;
          }}
          onMove={async (to) => {
            const moved = await deck.moveKey(dialogSlot, to);
            if (moved) setDialogSlot(null);
            return moved;
          }}
          onClose={() => setDialogSlot(null)}
          statusText={statusText}
        />
      )}
    </main>
  );
}
