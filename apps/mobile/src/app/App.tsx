import { ACTION_REGISTRY, MAX_KEY_SLOTS, type ActionType, type Board, type BoardKind } from "@speed-deck/core";
import { LayoutGrid, MessageSquare, Settings, Smartphone, Video } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  BOARD_POSITION_STORAGE_KEY,
  LocalStorageBoardPositionStore,
  SPACE_BOARD_POSITION_STORAGE_KEYS,
  type BoardPositionStore,
} from "../adapters/local-storage-board-position-store";
import { BoardMenu } from "../components/BoardMenu";
import { BoardPlayer } from "../components/BoardPlayer";
import { Composer, type ComposerHandle } from "../components/Composer";
import { ConnectPanel } from "../components/ConnectPanel";
import { DeckStatus, DeckStatusIndicator } from "../components/DeckStatus";
import { ActionPickerDialog, KeyEditorDialog } from "../components/KeyEditorDialog";
import { KeyInspector } from "../components/KeyInspector";
import { KeyInspectorEmpty } from "../components/KeyInspectorEmpty";
import { ObsSettings } from "../components/ObsSettings";
import { RecentPhrases } from "../components/RecentPhrases";
import { SectionView } from "../components/SectionView";
import { SettingsPanel } from "../components/SettingsPanel";
import { SideNav, type NavItem } from "../components/SideNav";
import { obsTone } from "../components/StatusDot";
import { I18nProvider, useMessageText, useT } from "../i18n/I18nProvider";
import type { Message, MessageKey } from "../i18n/messages";
import type { AppServices } from "./composition-root";
import { describeRequestError } from "./describe-error";
import { isDesktopShell } from "./desktop-shell";
import { useAppearance, type AppearancePreference } from "./use-appearance";
import { useConnection } from "./use-connection";
import { useSpaceDecks } from "./use-deck";
import { actionOnlyKey } from "./key-draft";
import { useLanguagePreference, type LanguagePreference } from "./use-language-preference";
import { INSPECTOR_QUERY, useMediaQuery } from "./use-media-query";
import { SECTIONS, spaceOfSection, useNavCollapsed, useSection, type Section } from "./use-section";
import { useSpeech } from "./use-speech";
import { useSpeechTarget, type SpeechTarget } from "./use-speech-target";

export { describeSpeechError } from "./use-speech";

const ICON_SIZE = 22;
const SECTION_ICONS: Record<Section, ReactNode> = {
  voice: <MessageSquare size={ICON_SIZE} />,
  deck: <LayoutGrid size={ICON_SIZE} />,
  obs: <Video size={ICON_SIZE} />,
  connect: <Smartphone size={ICON_SIZE} />,
  settings: <Settings size={ICON_SIZE} />,
};

/** The app's mark: a small deck of keys, decorative next to its name. */
function AppMark() {
  return (
    <svg className="app-mark" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <rect x="2" y="5" width="6" height="6" rx="1.6" />
      <rect x="9" y="5" width="6" height="6" rx="1.6" opacity="0.55" />
      <rect x="16" y="5" width="6" height="6" rx="1.6" opacity="0.55" />
      <rect x="2" y="13" width="6" height="6" rx="1.6" opacity="0.55" />
      <rect x="9" y="13" width="6" height="6" rx="1.6" />
      <rect x="16" y="13" width="6" height="6" rx="1.6" opacity="0.55" />
    </svg>
  );
}

/** Container: chooses the speech target and interface language, then renders the app in that language. */
export function App({ services }: { services: AppServices }) {
  const target = useSpeechTarget(services, { forceComputer: isDesktopShell(navigator.userAgent) });
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

/** The key shown in the inspector, or an empty slot with the action chosen for it. */
interface Inspected {
  boardId: string;
  slot: number;
  assignedType?: ActionType;
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
  const [dialogSlot, setDialogSlot] = useState<number | null>(null);
  // Wide screens edit in a side panel; the + still asks for the action in a modal first.
  const isWide = useMediaQuery(INSPECTOR_QUERY);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  // The slot the player's + targets on the page on screen; the empty inspector adds there too.
  const [addSlot, setAddSlot] = useState<number | null>(null);
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
  const section: Section = storedSection === "connect" && !connection ? "deck" : storedSection;
  // OBS is reached through the computer app only; the menu item shows and says whether it is connected.
  const obsStatusTone = obsTone(target.isRemote, spaces.deck.obs);
  const navItems: NavItem<Section>[] = SECTIONS.filter((id) => id !== "connect" || connection).map((id) => ({
    id,
    label: t(`nav.${id}`),
    icon: SECTION_ICONS[id],
    status: id === "obs" ? { tone: obsStatusTone, label: t(`nav.obsStatus.${obsStatusTone}`) } : undefined,
  }));
  const space = spaceOfSection(section);
  const deck = space ? spaces[space] : null;
  const board = deck?.navigation.board ?? null;
  const inspectedKey = inspected && board?.id === inspected.boardId ? board.keys.find((key) => key.slot === inspected.slot) : undefined;
  // The panel only shows while its key (or the action chosen for its slot) is still on the board on screen.
  const inspection = isWide && inspected && board?.id === inspected.boardId && (inspectedKey || inspected.assignedType) ? inspected : null;
  // In the Deck the panel always keeps its place on wide screens, so selecting a key never moves the grid.
  const reservesPanel = isWide && space === "deck" && board !== null;

  const openKey = (slot: number) => {
    if (!isWide || !board) return setDialogSlot(slot);
    if (board.keys.some((key) => key.slot === slot)) setInspected({ boardId: board.id, slot });
    else setPickerSlot(slot);
  };

  const pickForSlot = async (slot: number, type: ActionType) => {
    if (!deck || !board) return;
    if (ACTION_REGISTRY[type].params.length > 0) {
      setPickerSlot(null);
      setInspected({ boardId: board.id, slot, assignedType: type });
      return;
    }
    const key = actionOnlyKey(slot, type, t);
    if (key && (await deck.saveKey(key, undefined))) {
      setPickerSlot(null);
      setInspected({ boardId: board.id, slot });
    }
  };
  // Deck keys only run through the computer app; say so once instead of leaving every key to explain itself.
  const showDeckStatus = space === "deck" && target.detection !== "pending";
  const deckNote: MessageKey | null = !showDeckStatus || target.isRemote ? null : target.isDesktopAvailable ? "deck.computerNotChosen" : "deck.needsComputer";
  // Wide screens keep the Deck workspace to keys and controls: texts stay for screen readers or move into the indicator.
  const isDeckWorkspace = isWide && space === "deck";
  const hasPanel = Boolean(inspection) || reservesPanel;

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

  const deckIndicator = showDeckStatus && isDeckWorkspace && deck && (
    <DeckStatusIndicator
      isComputerConnected={target.isRemote}
      obs={deck.obs}
      note={deckNote ? t(deckNote) : undefined}
      onOpenSettings={() => select("settings")}
      onOpenObs={() => select("obs")}
    />
  );

  return (
    // data-space picks the accent colour: each space has its own, OBS shares the Deck one and the rest the Voice one.
    <div
      className={["app", navCollapsed ? "app-nav-collapsed" : "", hasPanel ? "app-inspecting" : ""].filter(Boolean).join(" ")}
      data-space={space ?? (section === "obs" ? "deck" : "voice")}
    >
      <header className="app-header">
        <h1 className="app-brand">
          <AppMark />
          <span className="app-brand-name">{t("app.title")}</span>
        </h1>
      </header>

      <SideNav items={navItems} active={section} onSelect={select} collapsed={navCollapsed} onCollapsedChange={setNavCollapsed} />

      <main className="app-main">
        {!target.synthesizer.isSupported && (
          <p className="notice" role="alert">
            {t("app.speechUnsupported")}
          </p>
        )}

        <p className={isDeckWorkspace ? "status visually-hidden" : "status"} role="status" aria-live="polite">
          {statusText || (target.error ? t(target.error) : "")}
        </p>

        {space && deck && (
          <SectionView key={space} title={t(`nav.${space}`)} focusHeading={navigated} hideTitle={isDeckWorkspace}>
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
              {showDeckStatus && !isDeckWorkspace && <DeckStatus isComputerConnected={target.isRemote} obs={deck.obs} />}
              {deckNote && !isDeckWorkspace && (
                <div className="deck-note">
                  <p className="empty">{t(deckNote)}</p>
                  {deckNote === "deck.computerNotChosen" && (
                    <button type="button" className="button button-small" onClick={() => select("settings")}>
                      {t("deck.openSettings")}
                    </button>
                  )}
                </div>
              )}
              {/* Without a board there is no deck header to hold the indicator, so it gets a row of its own. */}
              {deckIndicator && !board && <div className="deck-header">{deckIndicator}</div>}
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
              <div className="deck-layout">
                <BoardPlayer
                  navigation={deck.navigation}
                  context={deck.context}
                  onRun={deck.run}
                  isSpeaking={speech.isSpeaking}
                  onEditKey={openKey}
                  selectedSlot={inspection?.slot ?? null}
                  onAddSlotChange={setAddSlot}
                  onDeleteKey={deck.clearKey}
                  onMoveKey={deck.moveKey}
                  toolbar={
                    board && (
                      <>
                        <BoardMenu
                          board={board}
                          offered={deck.spaceBoards}
                          boards={deck.boards}
                          language={language}
                          onSelect={(boardId) => deck.navigation.go({ boardId, page: 0 })}
                          statusText={statusText}
                        />
                        {deckIndicator}
                      </>
                    )
                  }
                />
              </div>
            </>
          </SectionView>
        )}

        {section === "obs" && (
          <SectionView key="obs" title={t("nav.obs")} focusHeading={navigated}>
            <div className="settings">
              {target.obsSettings ? (
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
              ) : (
                <>
                  <p className="field-hint">{t("obs.needsComputer")}</p>
                  {/* The computer is there but this device speaks itself: choosing the computer is in Settings. */}
                  {target.isDesktopAvailable && !target.isRemote && (
                    <button type="button" className="button button-small obs-open-settings" onClick={() => select("settings")}>
                      {t("deck.openSettings")}
                    </button>
                  )}
                </>
              )}
            </div>
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
            />
          </SectionView>
        )}
      </main>

      {/* The inspector docks to the window edge, beside the workspace (wide screens, Deck only while reserved). */}
      {inspection && deck && board && (
        <KeyInspector
          key={`${inspection.boardId}:${inspection.slot}:${inspection.assignedType ?? ""}`}
          slot={inspection.slot}
          existing={inspectedKey}
          assignedType={inspectedKey ? undefined : inspection.assignedType}
          boardKind={board.kind}
          boards={deck.boards.boards}
          obs={target.obs}
          onTest={deck.run}
          onSave={async (key) => {
            const saved = await deck.saveKey(key, inspectedKey);
            if (saved) setInspected({ boardId: board.id, slot: key.slot });
            return saved;
          }}
          onMove={async (to) => {
            const moved = await deck.moveKey(inspection.slot, to);
            if (moved) setInspected({ boardId: board.id, slot: to });
            return moved;
          }}
          onClose={() => setInspected(null)}
        />
      )}
      {!inspection && reservesPanel && <KeyInspectorEmpty addSlot={addSlot} onAdd={setPickerSlot} />}

      {pickerSlot !== null && deck && board && (
        <ActionPickerDialog
          key={`${board.id}:${pickerSlot}`}
          slot={pickerSlot}
          boardKind={board.kind}
          onPick={(type) => void pickForSlot(pickerSlot, type)}
          onClose={() => setPickerSlot(null)}
          statusText={statusText}
        />
      )}

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
