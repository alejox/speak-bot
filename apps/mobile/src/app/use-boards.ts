import {
  navigateBoard,
  resolveBoardPosition,
  type Board,
  type BoardPosition,
  type NavigationAction,
  type UiLanguage,
} from "@speed-deck/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardStore } from "../adapters/board-stores";
import type { BoardPositionStore } from "../adapters/local-storage-board-position-store";
import type { Message } from "../i18n/messages";
import { describeRequestError } from "./describe-error";

export interface Boards {
  boards: Board[];
  isLoaded: boolean;
  store: BoardStore;
  /**
   * Runs a change on the store, reloads the boards and announces `success` (or the localized error).
   * Resolves with the change's result, or undefined when it failed.
   */
  change: <T>(run: (store: BoardStore) => Promise<T>, success?: (result: T) => Message | null) => Promise<T | undefined>;
}

/** The boards of the current target, created on first run on this device and reloaded when they change elsewhere. */
export function useBoards(store: BoardStore, language: UiLanguage, report: (message: Message | null) => void): Boards {
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  // Read when preparing the first board, without reloading on every language change.
  const languageRef = useRef(language);
  languageRef.current = language;
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    let active = true;
    // Never keep another store's boards on screen, even if this one fails to load.
    setBoards([]);
    setIsLoaded(false);
    const load = async () => {
      const loaded = await store.list();
      if (!active) return;
      setBoards(loaded);
      setIsLoaded(true);
    };
    void store
      .prepare(languageRef.current)
      .then(load)
      .catch(() => active && reportRef.current({ key: "status.loadFailed" }));
    const unsubscribe = store.onChanged(() => void load().catch(() => {}));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [store]);

  const change = useCallback(
    async <T,>(run: (store: BoardStore) => Promise<T>, success?: (result: T) => Message | null): Promise<T | undefined> => {
      try {
        const result = await run(store);
        setBoards(await store.list());
        reportRef.current(success?.(result) ?? null);
        return result;
      } catch (error) {
        reportRef.current(describeRequestError(error));
        // Another device may have changed the boards meanwhile.
        store.list().then(setBoards, () => {});
        return undefined;
      }
    },
    [store],
  );

  return { boards, isLoaded, store, change };
}

export interface BoardNavigation {
  /** Null while there is no board. */
  position: BoardPosition | null;
  board: Board | null;
  go: (position: BoardPosition) => void;
  navigate: (action: NavigationAction) => void;
}

/** Folders opened one inside another; more than this is never kept. */
const MAX_TRAIL_LENGTH = 10;

/**
 * The board and page this client shows, remembered on this device and kept valid when boards change.
 * Opening a folder remembers where it was opened from, so its Back key returns to that page.
 */
export function useBoardNavigation(boards: readonly Board[], store: BoardPositionStore): BoardNavigation {
  const [saved, setSaved] = useState<BoardPosition | null>(() => store.load());
  // Where each open folder was opened from, innermost last.
  const trail = useRef<BoardPosition[]>([]);
  const position = resolveBoardPosition(boards, saved);
  const board = boards.find((candidate) => candidate.id === position?.boardId) ?? null;
  const go = (next: BoardPosition) => {
    setSaved(next);
    store.save(next);
  };
  return {
    position,
    board,
    go,
    navigate: (action) => {
      if (!position) return;
      const next = navigateBoard(boards, position, action);
      if (action.type === "nav.openFolder" && next.boardId !== position.boardId) {
        trail.current = [...trail.current, position].slice(-MAX_TRAIL_LENGTH);
      } else if (action.type === "nav.folderBack") {
        const from = trail.current.at(-1);
        trail.current = trail.current.slice(0, -1);
        // Back to the page the folder was opened from, when that is still the board the folder is in.
        if (from && from.boardId === next.boardId && next.boardId !== position.boardId) return go(resolveBoardPosition(boards, from) ?? next);
      }
      go(next);
    },
  };
}
