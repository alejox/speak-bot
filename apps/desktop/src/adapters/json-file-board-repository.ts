import { readStoredBoards, type Board, type BoardChange, type BoardRepository } from "@speed-deck/core";
import { readJsonFile, SerialQueue, writeJsonFileAtomic } from "./json-file";

/** Version of the boards file layout, so later versions can migrate it. */
export const BOARDS_FILE_VERSION = 1;

/**
 * Stores every board in one JSON file (`{ version, boards }`). Each `update` reads, validates, changes
 * and writes inside a single queued job, so concurrent requests can never interleave a check with
 * another request's write.
 */
export class JsonFileBoardRepository implements BoardRepository {
  private readonly queue = new SerialQueue();

  constructor(private readonly file: string) {}

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
        await writeJsonFileAtomic(this.file, { version: BOARDS_FILE_VERSION, boards: valid });
      }
      return result;
    });
  }

  private async read(): Promise<Board[]> {
    const content = await readJsonFile(this.file);
    if (content.status !== "ok" || typeof content.value !== "object" || content.value === null) return [];
    return readStoredBoards((content.value as { boards?: unknown }).boards);
  }
}

function keyCount(boards: readonly Board[]): number {
  return boards.reduce((total, board) => total + (Array.isArray(board.keys) ? board.keys.length : 0), 0);
}
