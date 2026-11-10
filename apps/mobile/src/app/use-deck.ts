import type { Action, Key, UiLanguage } from "@speed-deck/core";
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

/** Boards, this client's position, OBS state and key execution for one view (the app or the dock). */
export function useDeck(
  target: SpeechTarget,
  speech: Speech,
  language: UiLanguage,
  positionStore: BoardPositionStore,
  report: (message: Message | null) => void,
): Deck {
  const boards = useBoards(target.boards, language, report);
  const navigation = useBoardNavigation(boards.boards, positionStore);
  const obs = useObs(target.obs, target.obsSettings?.enabled ?? null);
  const voiceLanguage = target.voiceLanguage ?? language;
  const context = useMemo<KeyContext>(
    () => ({ isRemote: target.isRemote, obs, captionsVisible: target.captionsVisible, voiceLanguage, boards: boards.boards }),
    [target.isRemote, obs, target.captionsVisible, voiceLanguage, boards.boards],
  );
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
