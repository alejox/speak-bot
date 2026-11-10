import type { BoardPosition } from "@speed-deck/core";
import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** The board and page this client shows; every client (app, OBS dock) keeps its own. */
export interface BoardPositionStore {
  load(): BoardPosition | null;
  save(position: BoardPosition): void;
}

export const BOARD_POSITION_STORAGE_KEY = "speed-deck:board-position";
export const DOCK_BOARD_POSITION_STORAGE_KEY = "speed-deck:dock-board-position";

export class LocalStorageBoardPositionStore implements BoardPositionStore {
  constructor(
    private readonly key: string = BOARD_POSITION_STORAGE_KEY,
    private readonly storage: Storage | null = getLocalStorage(),
  ) {}

  load(): BoardPosition | null {
    const stored = readJson(this.storage, this.key);
    if (typeof stored !== "object" || stored === null) return null;
    const { boardId, page } = stored as Record<string, unknown>;
    return typeof boardId === "string" && typeof page === "number" && Number.isInteger(page) && page >= 0 ? { boardId, page } : null;
  }

  save(position: BoardPosition): void {
    writeJson(this.storage, this.key, { boardId: position.boardId, page: position.page });
  }
}
