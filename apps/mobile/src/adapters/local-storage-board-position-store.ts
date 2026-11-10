import type { BoardKind, BoardPosition } from "@speed-deck/core";
import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** The board and page this client shows; every client (app, OBS dock) keeps its own. */
export interface BoardPositionStore {
  load(): BoardPosition | null;
  save(position: BoardPosition): void;
}

/** Where the app kept its single position before it had a Voice and a Deck space. */
export const BOARD_POSITION_STORAGE_KEY = "speed-deck:board-position";
export const DOCK_BOARD_POSITION_STORAGE_KEY = "speed-deck:dock-board-position";
/** Each space of the app remembers its own board and page. */
export const SPACE_BOARD_POSITION_STORAGE_KEYS: Readonly<Record<BoardKind, string>> = {
  voice: "speed-deck:board-position:voice",
  deck: "speed-deck:board-position:deck",
};

export class LocalStorageBoardPositionStore implements BoardPositionStore {
  /**
   * `fallbackKey` is read while nothing was saved under `key` yet. A space reads the position stored
   * before spaces through it: the position only resolves in the space that lists its board, so it
   * ends up in Voice when that board is a voice board and in Deck otherwise.
   */
  constructor(
    private readonly key: string = BOARD_POSITION_STORAGE_KEY,
    private readonly storage: Storage | null = getLocalStorage(),
    private readonly fallbackKey?: string,
  ) {}

  load(): BoardPosition | null {
    return this.read(this.key) ?? (this.fallbackKey === undefined ? null : this.read(this.fallbackKey));
  }

  private read(key: string): BoardPosition | null {
    const stored = readJson(this.storage, key);
    if (typeof stored !== "object" || stored === null) return null;
    const { boardId, page } = stored as Record<string, unknown>;
    return typeof boardId === "string" && typeof page === "number" && Number.isInteger(page) && page >= 0 ? { boardId, page } : null;
  }

  save(position: BoardPosition): void {
    writeJson(this.storage, this.key, { boardId: position.boardId, page: position.page });
  }
}
