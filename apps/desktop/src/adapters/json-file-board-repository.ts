import { readStoredBoards, type Board, type BoardChange, type BoardRepository } from "@speed-deck/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic, type JsonFileOptions } from "./json-file";

/** Version of the boards file layout, so later versions can migrate it. */
export const BOARDS_FILE_VERSION = 1;

/** What a boards file holds: an object with a list of boards. Anything else is a damaged file, not "no boards". */
function isBoardsFile(value: unknown): boolean {
  return typeof value === "object" && value !== null && Array.isArray((value as { boards?: unknown }).boards);
}

/**
 * Stores every board in one JSON file (`{ version, boards }`). Each `update` reads, validates, changes
 * and writes inside a single queued job, so concurrent requests can never interleave a check with
 * another request's write. A damaged file is kept aside and the boards saved before the last change come
 * back (see `readJsonFile`); `options.onRecovery` hears about it.
 */
export class JsonFileBoardRepository implements BoardRepository {
  private readonly queue = new SerialQueue();
  private readonly options: JsonFileOptions;

  constructor(
    private readonly file: string,
    options: Omit<JsonFileOptions, "isValid"> = {},
  ) {
    this.options = { ...options, isValid: isBoardsFile };
  }

  list(): Promise<Board[]> {
    return this.queue.run(() => this.read());
  }

  update<T>(change: (boards: readonly Board[]) => BoardChange<T>): Promise<T> {
    return this.queue.run(async () => {
      const { boards, result } = change(await this.read());
      if (boards) {
        // Re-validate before writing: a board or key the reader would drop must never reach the file.
        const valid = readStoredBoards(boards);
        if (keyCount(valid) !== keyCount(boards) || valid.length !== boards.length) throw new Error("Refusing to store invalid boards.");
        await writeJsonFileAtomic(this.file, { version: BOARDS_FILE_VERSION, boards: valid }, this.options);
      }
      return result;
    });
  }

  /** Boards stored before boards had a kind get one here (a mixed board is split), the same on every read. */
  private async read(): Promise<Board[]> {
    const content = await readJsonFile(this.file, this.options);
    if (content.status !== "ok") return [];
    return readStoredBoards((content.value as { boards?: unknown }).boards);
  }
}

function keyCount(boards: readonly Board[]): number {
  return boards.reduce((total, board) => total + (Array.isArray(board.keys) ? board.keys.length : 0), 0);
}
