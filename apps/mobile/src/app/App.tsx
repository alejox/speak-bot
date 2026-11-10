import { MAX_KEY_SLOTS, type Board, type BoardKind } from "@speed-deck/core";
import { LayoutGrid, MessageSquare, Settings, Smartphone } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  BOARD_POSITION_STORAGE_KEY,
  LocalStorageBoardPositionStore,
  SPACE_BOARD_POSITION_STORAGE_KEYS,
  type BoardPositionStore,
} from "../adapters/local-storage-board-position-store";
import { BoardEditor } from "../components/BoardEditor";
import { BoardPlayer } from "../components/BoardPlayer";
import { Composer, type ComposerHandle } from "../components/Composer";
import { ConnectPanel } from "../components/ConnectPanel";
import { DeckStatus } from "../components/DeckStatus";
import { KeyEditorDialog } from "../components/KeyEditorDialog";
import { ObsSettings } from "../components/ObsSettings";
import { RecentPhrases } from "../components/RecentPhrases";
import { SectionView } from "../components/SectionView";
import { SettingsPanel } from "../components/SettingsPanel";
import { SideNav, type NavItem } from "../components/SideNav";
import { I18nProvider, useMessageText, useT } from "../i18n/I18nProvider";
import type { Message, MessageKey } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { describeRequestError } from "./describe-error";
import { useAppearance, type AppearancePreference } from "./use-appearance";
import { useConnection } from "./use-connection";
import { useSpaceDecks } from "./use-deck";
import { useLanguagePreference, type LanguagePreference } from "./use-language-preference";
import { useMediaQuery, WIDE_EDITOR_QUERY } from "./use-media-query";
import { SECTIONS, spaceOfSection, useNavCollapsed, useSection, type Section } from "./use-section";
import { useSpeech } from "./use-speech";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

export { describeSpeechError } from "./use-speech";

const ICON_SIZE = 22;
const SECTION_ICONS: Record<Section, ReactNode> = {
  voice: <MessageSquare size={ICON_SIZE} />,
  deck: <LayoutGrid size={ICON_SIZE} />,
  connect: <Smartphone size={ICON_SIZE} />,
  settings: <Settings size={ICON_SIZE} />,
};

/** Container: chooses the speech target and interface language, then renders the app in that language. */
export function App({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services);
  const preference = useLanguagePreference(services.language, target);
  const appearance = useAppearance(services.appearance);
  return (
    <I18nProvider language={preference.language}>
      <AppContent target={target} preference={preference} appearance={appearance} services={services} />
    </I18nProvider>
  );
}

interface AppContentProps {
  services: AppServices;
  target: SpeechTarget;
  preference: LanguagePreference;
  appearance: AppearancePreference;
}

/** One position per space; each starts from the position stored before the app had spaces. */
function createSpacePositionStores(): Record<BoardKind, BoardPositionStore> {
  const storeOf = (kind: BoardKind) => new LocalStorageBoardPositionStore(SPACE_BOARD_POSITION_STORAGE_KEYS[kind], undefined, BOARD_POSITION_STORAGE_KEY);
  return { voice: storeOf("voice"), deck: storeOf("deck") };
}

/** The first empty slot of `board`, or null when it is full. */
function firstFreeSlot(board: Board): number | null {
  const used = new Set(board.keys.map((key) => key.slot));
  for (let slot = 0; slot < MAX_KEY_SLOTS; slot += 1) if (!used.has(slot)) return slot;
  return null;
}

/** Container: wires the sections to the speech, board and connection hooks. */
function AppContent({ services, target, preference, appearance }: AppContentProps) {
  const t = useT();
  const { language } = preference;
  const connection = useConnection(services.desktop?.connection, target.isDesktopAvailable);
  const [status, setStatus] = useState<Message | null>(null);
  const statusText = useMessageText(status);
  const speech = useSpeech(target, language, setStatus);
  const [positionStores] = useState(createSpacePositionStores);
  const isWide = useMediaQuery(WIDE_EDITOR_QUERY);
  const [isEditing, setIsEditing] = useState(false);
  const [dialogSlot, setDialogSlot] = useState<number | null>(null);
  const [storedSection, setSection] = useSection();
  const [navCollapsed, setNavCollapsed] = useNavCollapsed();
  const [navigated, setNavigated] = useState(false);
  const [text, setText] = useState("");
  const [recentPhrases, setRecentPhrases] = useState(() => services.recentPhrases.load());
  const composer = useRef<ComposerHandle>(null);

  const select = (next: Section) => {
    setSection(next);
    setNavigated(true);
  };
  const spaces = useSpaceDecks(target, speech, language, positionStores, select, setStatus);

  // Connect only exists on the computer itself; fall back when it is not available.
  const section: Section = storedSection === "connect" && !connection ? "voice" : storedSection;
  const navItems: NavItem<Section>[] = SECTIONS.filter((id) => id !== "connect" || connection).map((id) => ({ id, label: t(`nav.${id}`), icon: SECTION_ICONS[id] }));
  const space = spaceOfSection(section);
  const deck = space ? spaces[space] : null;
  const board = deck?.navigation.board ?? null;
  const isEditorOpen = board !== null && isEditing && isWide;
  // Deck keys only run through the computer app; say so once instead of leaving every key to explain itself.
  const showDeckStatus = space === "deck" && target.detection !== "pending";
  const deckNote: MessageKey | null = !showDeckStatus || target.isRemote ? null : target.isDesktopAvailable ? "deck.computerNotChosen" : "deck.needsComputer";

  // Only what is typed here is remembered; phrases on board keys are already one tap away.
  const speakComposerText = () => {
    speech.speak(text);
    if (text.trim() !== "") setRecentPhrases(services.recentPhrases.add(text));
  };
  const clearRecentPhrases = () => {
    services.recentPhrases.clear();
    setRecentPhrases([]);
    // The row is gone, and focus with it: hand it to the text box.
    composer.current?.focusText();
  };

  const saveTextAsKey = async () => {
    const trimmed = text.trim();
    if (trimmed === "") return setStatus({ key: "status.typeToSave" });
    const voiceBoard = spaces.voice.navigation.board;
    if (!voiceBoard) return;
    const slot = firstFreeSlot(voiceBoard);
    if (slot === null) return setStatus({ key: "status.boardFull" });
    await spaces.voice.boards.change(
      (store) => store.setKey(voiceBoard.id, { slot, action: { type: "voice.speak", text: trimmed } }),
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
    // data-space picks the accent colour: each space has its own, and the other sections share the Voice one.
    <div className={["app", isEditorOpen ? "app-editing" : "", navCollapsed ? "app-nav-collapsed" : ""].filter(Boolean).join(" ")} data-space={space ?? "voice"}>
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

        {space && deck && (
          <SectionView key={space} title={isEditorOpen ? t("editor.title") : t(`nav.${space}`)} focusHeading={navigated}>
            {isEditorOpen ? (
              <>
                <div className="editor-toolbar">
                  <button type="button" className="button button-small" onClick={() => setIsEditing(false)}>
                    {t("board.closeEditor")}
                  </button>
                </div>
                <BoardEditor
                  boards={deck.boards}
                  spaceBoards={deck.spaceBoards}
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
              <>
                {space === "voice" && (
                  <>
                    <Composer
                      ref={composer}
                      text={text}
                      isSpeaking={speech.isSpeaking}
                      onTextChange={setText}
                      onSpeak={speakComposerText}
                      onStop={speech.stop}
                      onSave={() => void saveTextAsKey()}
                    />
                    <RecentPhrases phrases={recentPhrases} onSpeak={speech.speak} onClear={clearRecentPhrases} />
                  </>
                )}
                {showDeckStatus && <DeckStatus isComputerConnected={target.isRemote} obs={deck.obs} />}
                {deckNote && (
                  <div className="deck-note">
                    <p className="empty">{t(deckNote)}</p>
                    {deckNote === "deck.computerNotChosen" && (
                      <button type="button" className="button button-small" onClick={() => select("settings")}>
                        {t("deck.openSettings")}
                      </button>
                    )}
                  </div>
                )}
                {!deck.boards.isLoaded && <p className="empty">{t("board.loading")}</p>}
                {deck.boards.isLoaded && !board && (
                  <div className="space-empty">
                    <p className="empty">{t("space.empty")}</p>
                    <button
                      type="button"
                      className="button button-small button-primary"
                      onClick={() =>
                        void deck.boards.change(
                          (store) => store.create(t("boards.defaultName", { number: deck.boards.boards.length + 1 }), space),
                          (created) => ({ key: "boards.created", params: { name: created.name } }),
                        )
                      }
                    >
                      {t("boards.create")}
                    </button>
                  </div>
                )}
                <BoardPlayer
                  boards={deck.spaceBoards}
                  navigation={deck.navigation}
                  context={deck.context}
                  onRun={deck.run}
                  isSpeaking={speech.isSpeaking}
                  onEditKey={setDialogSlot}
                  onDeleteKey={deck.clearKey}
                  onMoveKey={deck.moveKey}
                  isEditing={isEditing && !isWide}
                  toolbar={editToggle}
                />
              </>
            )}
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
              voicesLoaded={target.voicesLoaded}
              voiceLanguage={target.voiceLanguage ?? language}
              settings={target.settings}
              onChange={target.updateSettings}
              isSpeaking={speech.isSpeaking}
              onPreview={speech.speak}
              onLanguageChange={preference.setLanguage}
              appearance={appearance.appearance}
              onAppearanceChange={appearance.setAppearance}
              speakOn={target.speakOn}
              outputDevice={target.outputDevice}
              deckSettings={
                target.obsSettings && (
                  <ObsSettings
                    settings={target.obsSettings}
                    live={spaces.deck.obs}
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
                )
              }
            />
          </SectionView>
        )}
      </main>

      {dialogSlot !== null && deck && board && (
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
    </div>
  );
}
