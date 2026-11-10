import type { Action, Board, BoardKind, Key, UiLanguage } from "@speed-deck/core";
import { useMemo } from "react";
import type { KeyInput } from "../adapters/board-stores";
import type { BoardPositionStore } from "../adapters/local-storage-board-position-store";
import type { Message } from "../i18n/messages";
import type { KeyContext, ObsLive } from "./key-presentation";
import { useBoardNavigation, useBoards, type BoardNavigation, type Boards } from "./use-boards";
import { createKeyRunner } from "./use-key-runner";
import { useObs } from "./use-obs";
import type { Speech } from "./use-speech";
import type { SpeechTarget } from "./use-speech-target";

export interface Deck {
  boards: Boards;
  navigation: BoardNavigation;
  context: KeyContext;
  obs: ObsLive | null;
  /** Runs an action; local speech starts synchronously, inside the tap. */
  run: (action: Action) => void;
  /** Saves `key` into a slot of the current board; resolves true when saved. */
  saveKey: (key: KeyInput, existing: Key | undefined) => Promise<boolean>;
  /** Empties a slot of the current board; resolves true when deleted. */
  clearKey: (slot: number) => Promise<boolean>;
  /** Moves a key of the current board; resolves true when moved. */
  moveKey: (from: number, to: number) => Promise<boolean>;
}

/** What every view of the boards shares, whichever board it shows. */
interface DeckState {
  boards: Boards;
  obs: ObsLive | null;
  context: KeyContext;
  voiceLanguage: UiLanguage;
}

function useDeckState(target: SpeechTarget, language: UiLanguage, report: (message: Message | null) => void): DeckState {
  const boards = useBoards(target.boards, language, report);
  const obs = useObs(target.obs, target.obsSettings?.enabled ?? null);
  const voiceLanguage = target.voiceLanguage ?? language;
  const context = useMemo<KeyContext>(
    () => ({ isRemote: target.isRemote, obs, captionsVisible: target.captionsVisible, voiceLanguage, boards: boards.boards }),
    [target.isRemote, obs, target.captionsVisible, voiceLanguage, boards.boards],
  );
  return { boards, obs, context, voiceLanguage };
}

/** Key execution and key editing on the board `navigation` shows. */
function deckOf(
  { boards, obs, context, voiceLanguage }: DeckState,
  navigation: BoardNavigation,
  target: SpeechTarget,
  speech: Speech,
  report: (message: Message | null) => void,
): Deck {
  const run = createKeyRunner({ target, speech, voiceLanguage, navigate: navigation.navigate, report });
  const boardId = navigation.board?.id;

  return {
    boards,
    navigation,
    context,
    obs,
    run,
    saveKey: async (key, existing) => {
      if (!boardId) return false;
      const saved = await boards.change((store) => store.setKey(boardId, key, { replace: existing !== undefined }), () => ({ key: "editor.saved" }));
      return saved !== undefined;
    },
    clearKey: async (slot) => {
      if (!boardId) return false;
      const done = await boards.change(
        async (store) => {
          await store.clearKey(boardId, slot);
          return true;
        },
        () => ({ key: "editor.deleted" }),
      );
      return done === true;
    },
    moveKey: async (from, to) => {
      if (!boardId) return false;
      const moved = await boards.change((store) => store.moveKey(boardId, from, to), () => ({ key: "editor.moved", params: { number: to + 1 } }));
      return moved !== undefined;
    },
  };
}

/** Boards, this client's position, OBS state and key execution for a view of every board (the OBS dock). */
export function useDeck(
  target: SpeechTarget,
  speech: Speech,
  language: UiLanguage,
  positionStore: BoardPositionStore,
  report: (message: Message | null) => void,
): Deck {
  const state = useDeckState(target, language, report);
  const navigation = useBoardNavigation(state.boards.boards, positionStore);
  return deckOf(state, navigation, target, speech, report);
}

/** One space of the app: the boards of one kind, with its own position. `boards` still holds every board. */
export interface SpaceDeck extends Deck {
  kind: BoardKind;
  /** The boards this space lists. */
  spaceBoards: readonly Board[];
}

/**
 * The Voice and Deck spaces of the app. They share the boards and OBS state, and each one keeps its
 * own board and page. A key that opens a board of the other kind (possible in boards made before
 * spaces) opens it there and calls `onOpenSpace` with that kind.
 */
export function useSpaceDecks(
  target: SpeechTarget,
  speech: Speech,
  language: UiLanguage,
  positionStores: Readonly<Record<BoardKind, BoardPositionStore>>,
  onOpenSpace: (kind: BoardKind) => void,
  report: (message: Message | null) => void,
): Record<BoardKind, SpaceDeck> {
  const state = useDeckState(target, language, report);
  const all = state.boards.boards;
  const spaceBoards = useMemo<Record<BoardKind, Board[]>>(
    () => ({ voice: all.filter((board) => board.kind === "voice"), deck: all.filter((board) => board.kind === "deck") }),
    [all],
  );
  const navigations: Record<BoardKind, BoardNavigation> = {
    voice: useBoardNavigation(spaceBoards.voice, positionStores.voice),
    deck: useBoardNavigation(spaceBoards.deck, positionStores.deck),
  };

  const spaceOf = (kind: BoardKind): SpaceDeck => {
    const other: BoardKind = kind === "voice" ? "deck" : "voice";
    const own = navigations[kind];
    const navigation: BoardNavigation = {
      ...own,
      navigate: (action) => {
        if (action.type === "nav.goToBoard" && spaceBoards[other].some((board) => board.id === action.boardId)) {
          navigations[other].go({ boardId: action.boardId, page: 0 });
          onOpenSpace(other);
        } else own.navigate(action);
      },
    };
    return { ...deckOf(state, navigation, target, speech, report), kind, spaceBoards: spaceBoards[kind] };
  };
  return { voice: spaceOf("voice"), deck: spaceOf("deck") };
}
