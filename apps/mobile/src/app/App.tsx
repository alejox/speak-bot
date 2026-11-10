import { MAX_KEY_SLOTS, type Board } from "@speed-deck/core";
import { LayoutGrid, MessageSquare, Settings, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LocalStorageBoardPositionStore } from "../adapters/local-storage-board-position-store";
import { BoardEditor } from "../components/BoardEditor";
import { BoardPlayer } from "../components/BoardPlayer";
import { Composer } from "../components/Composer";
import { ConnectPanel } from "../components/ConnectPanel";
import { KeyEditorDialog } from "../components/KeyEditorDialog";
import { ObsSettings } from "../components/ObsSettings";
import { QuickKeys } from "../components/QuickKeys";
import { SectionView } from "../components/SectionView";
import { SettingsPanel } from "../components/SettingsPanel";
import { SideNav, type NavItem } from "../components/SideNav";
import { I18nProvider, useMessageText, useT } from "../i18n/I18nProvider";
import type { Message } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { describeRequestError } from "./describe-error";
import { useConnection } from "./use-connection";
import { useDeck } from "./use-deck";
import { useLanguagePreference, type LanguagePreference } from "./use-language-preference";
import { useMediaQuery, WIDE_EDITOR_QUERY } from "./use-media-query";
import { useNavCollapsed, useSection, type Section } from "./use-section";
import { useSpeech } from "./use-speech";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

export { describeSpeechError } from "./use-speech";

const ICON_SIZE = 22;
const SECTION_ICONS: Record<Section, ReactNode> = {
  board: <LayoutGrid size={ICON_SIZE} />,
  speak: <MessageSquare size={ICON_SIZE} />,
  connect: <Smartphone size={ICON_SIZE} />,
  settings: <Settings size={ICON_SIZE} />,
};

/** Container: chooses the speech target and interface language, then renders the app in that language. */
export function App({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services);
  const preference = useLanguagePreference(services.language, target);
  return (
    <I18nProvider language={preference.language}>
      <AppContent target={target} preference={preference} services={services} />
    </I18nProvider>
  );
}

interface AppContentProps {
  services: AppServices;
  target: SpeechTarget;
  preference: LanguagePreference;
}

/** The first empty slot of `board`, or null when it is full. */
function firstFreeSlot(board: Board): number | null {
  const used = new Set(board.keys.map((key) => key.slot));
  for (let slot = 0; slot < MAX_KEY_SLOTS; slot += 1) if (!used.has(slot)) return slot;
  return null;
}

/** Container: wires the sections to the speech, board and connection hooks. */
function AppContent({ services, target, preference }: AppContentProps) {
  const t = useT();
  const { language } = preference;
  const connection = useConnection(services.desktop?.connection, target.isDesktopAvailable);
  const [status, setStatus] = useState<Message | null>(null);
  const statusText = useMessageText(status);
  const speech = useSpeech(target, language, setStatus);
  const [positionStore] = useState(() => new LocalStorageBoardPositionStore());
  const deck = useDeck(target, speech, language, positionStore, setStatus);
  const isWide = useMediaQuery(WIDE_EDITOR_QUERY);
  const [isEditing, setIsEditing] = useState(false);
  const [dialogSlot, setDialogSlot] = useState<number | null>(null);
  const [storedSection, setSection] = useSection();
  const [navCollapsed, setNavCollapsed] = useNavCollapsed();
  const [navigated, setNavigated] = useState(false);
  const [text, setText] = useState("");

  // Connect only exists on the computer itself; fall back when it is not available.
  const section: Section = storedSection === "connect" && !connection ? "board" : storedSection;
  const navItems: NavItem<Section>[] = (["board", "speak", "connect", "settings"] as const)
    .filter((id) => id !== "connect" || connection)
    .map((id) => ({ id, label: t(`nav.${id}`), icon: SECTION_ICONS[id] }));
  const isEditorOpen = section === "board" && isEditing && isWide;
  const board = deck.navigation.board;

  const select = (next: Section) => {
    setSection(next);
    setNavigated(true);
  };

  const saveTextAsKey = async () => {
    const trimmed = text.trim();
    if (trimmed === "") return setStatus({ key: "status.typeToSave" });
    if (!board) return;
    const slot = firstFreeSlot(board);
    if (slot === null) return setStatus({ key: "status.boardFull" });
    await deck.boards.change(
      (store) => store.setKey(board.id, { slot, action: { type: "voice.speak", text: trimmed } }),
      () => ({ key: "status.keySaved", params: { number: slot + 1 } }),
    );
  };

  const editToggle = isWide ? (
    <button type="button" className="button button-small" onClick={() => setIsEditing(true)}>
      {t("board.editBoard")}
    </button>
  ) : (
    <button type="button" className="button button-small" aria-pressed={isEditing} onClick={() => setIsEditing((value) => !value)}>
      {isEditing ? t("board.done") : t("board.edit")}
    </button>
  );

  return (
    <div className={["app", isEditorOpen ? "app-editing" : "", navCollapsed ? "app-nav-collapsed" : ""].filter(Boolean).join(" ")}>
      <header className="app-header">
        <h1>{t("app.title")}</h1>
      </header>

      <SideNav items={navItems} active={section} onSelect={select} collapsed={navCollapsed} onCollapsedChange={setNavCollapsed} />

      <main className="app-main">
        {!target.synthesizer.isSupported && (
          <p className="notice" role="alert">
            {t("app.speechUnsupported")}
          </p>
        )}

        {!isEditorOpen && (
          <p className="status" role="status" aria-live="polite">
            {statusText || (target.error ? t(target.error) : "")}
          </p>
        )}

        {section === "board" && (
          <SectionView key="board" title={isEditorOpen ? t("editor.title") : t("nav.board")} focusHeading={navigated}>
            {!deck.boards.isLoaded && <p className="empty">{t("board.loading")}</p>}
            {isEditorOpen ? (
              <>
                <div className="editor-toolbar">
                  <button type="button" className="button button-small" onClick={() => setIsEditing(false)}>
                    {t("board.closeEditor")}
                  </button>
                </div>
                <BoardEditor
                  boards={deck.boards}
                  navigation={deck.navigation}
                  context={deck.context}
                  obs={target.obs}
                  language={language}
                  onTest={deck.run}
                  statusText={statusText}
                  report={setStatus}
                />
              </>
            ) : (
              <BoardPlayer
                boards={deck.boards.boards}
                navigation={deck.navigation}
                context={deck.context}
                onRun={deck.run}
                onEditKey={setDialogSlot}
                isEditing={isEditing && !isWide}
                toolbar={editToggle}
              />
            )}
          </SectionView>
        )}

        {section === "speak" && (
          <SectionView key="speak" title={t("nav.speak")} focusHeading={navigated}>
            <Composer
              text={text}
              isSpeaking={speech.isSpeaking}
              onTextChange={setText}
              onSpeak={() => speech.speak(text)}
              onStop={speech.stop}
              onSave={() => void saveTextAsKey()}
            />
            <QuickKeys board={board} boards={deck.boards.boards} onPress={(key) => deck.run(key.action)} />
          </SectionView>
        )}

        {section === "connect" && connection && (
          <SectionView key="connect" title={t("nav.connect")} focusHeading={navigated}>
            <ConnectPanel {...connection} />
          </SectionView>
        )}

        {section === "settings" && (
          <SectionView key="settings" title={t("nav.settings")} focusHeading={navigated}>
            <SettingsPanel
              voices={target.voices}
              settings={target.settings}
              onChange={target.updateSettings}
              onLanguageChange={preference.setLanguage}
              speakOn={target.speakOn}
              outputDevice={target.outputDevice}
            >
              {target.obsSettings && (
                <ObsSettings
                  settings={target.obsSettings}
                  live={deck.obs}
                  canEdit={target.isOnComputer}
                  onSave={(patch) =>
                    target.saveObsSettings(patch).then(
                      () => {
                        setStatus({ key: "obs.saved" });
                        return true;
                      },
                      (error: unknown) => {
                        setStatus(describeRequestError(error));
                        return false;
                      },
                    )
                  }
                  onTest={() => {
                    setStatus(null);
                    target.obs?.connect().catch((error: unknown) => setStatus(describeRequestError(error)));
                  }}
                />
              )}
            </SettingsPanel>
          </SectionView>
        )}
      </main>

      {dialogSlot !== null && board && (
        <KeyEditorDialog
          key={`${board.id}:${dialogSlot}`}
          slot={dialogSlot}
          existing={board.keys.find((key) => key.slot === dialogSlot)}
          boards={deck.boards.boards}
          obs={target.obs}
          onTest={deck.run}
          onSave={async (key) => {
            const saved = await deck.saveKey(key, board.keys.find((candidate) => candidate.slot === dialogSlot));
            if (saved) setDialogSlot(null);
            return saved;
          }}
          onDelete={async () => {
            const deleted = await deck.clearKey(dialogSlot);
            if (deleted) setDialogSlot(null);
            return deleted;
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
    </div>
  );
}
