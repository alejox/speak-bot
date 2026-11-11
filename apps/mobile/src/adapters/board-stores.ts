import {
  clearKey,
  createBoard,
  deleteBoard,
  listBoards,
  moveKey,
  renameBoard,
  restoreDefaultBoard,
  setBoardGrid,
  setKey,
  type Action,
  type Board,
  type BoardGrid,
  type BoardKind,
  type Key,
  type UiLanguage,
} from "@speed-deck/core";
import type { DesktopApiClient } from "./desktop-api";
import type { DesktopEventSource } from "./desktop-events";
import { prepareLocalBoards, type LocalStorageBoardRepository } from "./local-storage-board-repository";

/** What a key editor saves; empty label, icon or color mean none. */
export interface KeyInput {
  slot: number;
  label?: string;
  icon?: string;
  color?: string;
  action: Action;
}

/** The boards of this device (phone-only mode) or of the desktop (Computer mode), behind one interface. */
export interface BoardStore {
  /** Creates the first board when there is none (first run on this device); a no-op on the desktop. */
  prepare(language: UiLanguage): Promise<void>;
  list(): Promise<Board[]>;
  /** Creates an empty board of `kind`. */
  create(name: string, kind: BoardKind): Promise<Board>;
  rename(boardId: string, name: string): Promise<Board>;
  /** Rejects for the only board. */
  remove(boardId: string): Promise<void>;
  /** An occupied slot rejects ("slot-occupied") unless `replace` is set. */
  setKey(boardId: string, key: KeyInput, options?: { replace?: boolean }): Promise<Key>;
  clearKey(boardId: string, slot: number): Promise<void>;
  /** Moves the key at `from` to `to`, swapping with a key already there. */
  moveKey(boardId: string, from: number, to: number): Promise<Board>;
  /** Puts back a built-in board: the communication board unless `boardId` names the built-in deck board. */
  restoreDefault(language: UiLanguage, boardId?: string): Promise<Board>;
  /** Gives every board `grid`, moving keys that no longer fit; rejects when a board has no room. */
  setGrid(grid: BoardGrid): Promise<Board[]>;
  /** Boards changed somewhere else (another device). Returns an unsubscribe function. */
  onChanged(listener: () => void): () => void;
}

/** Boards kept in this browser. */
export function createLocalBoardStore(repository: LocalStorageBoardRepository, generateId: () => string): BoardStore {
  let preparing: Promise<unknown> | null = null;
  return {
    prepare: async (language) => {
      // Shared by concurrent callers (e.g. React StrictMode) so the first board is created once.
      preparing ??= prepareLocalBoards(repository, language);
      await preparing;
    },
    list: () => listBoards(repository),
    create: (name, kind) => createBoard({ repository, generateId }, { name, kind }),
    rename: (boardId, name) => renameBoard(repository, boardId, name),
    remove: (boardId) => deleteBoard(repository, boardId),
    setKey: (boardId, key, options) => setKey(repository, boardId, key, options),
    clearKey: (boardId, slot) => clearKey(repository, boardId, slot),
    moveKey: (boardId, from, to) => moveKey(repository, boardId, from, to),
    restoreDefault: (language, boardId) => restoreDefaultBoard(repository, language, boardId),
    setGrid: (grid) => setBoardGrid(repository, grid),
    onChanged: () => () => {},
  };
}

/** Boards kept on the desktop; every device sees the same ones. */
export function createRemoteBoardStore(api: DesktopApiClient, events: DesktopEventSource): BoardStore {
  return {
    prepare: async () => {},
    list: () => api.listBoards(),
    create: (name, kind) => api.createBoard(name, kind),
    rename: (boardId, name) => api.renameBoard(boardId, name),
    remove: (boardId) => api.deleteBoard(boardId),
    setKey: (boardId, { slot, ...key }, options) => api.setKey(boardId, slot, key, options),
    clearKey: (boardId, slot) => api.clearKey(boardId, slot),
    moveKey: (boardId, from, to) => api.moveKey(boardId, from, to),
    restoreDefault: (language, boardId) => api.restoreDefaultBoard(language, boardId),
    setGrid: (grid) => api.setBoardGrid(grid),
    onChanged: (listener) =>
      events.subscribe((event) => {
        if (event.type === "boards-changed") listener();
      }),
  };
}
