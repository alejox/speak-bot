import type { Board } from "../domain/board";

/**
 * What a change computed: the boards to store (absent means "write nothing") and a value to return.
 */
export interface BoardChange<T> {
  boards?: Board[];
  result: T;
}

export interface BoardRepository {
  /** Every board, in display order. Stored data is validated on read. */
  list(): Promise<Board[]>;
  /**
   * Runs `change` on the current boards and stores what it returns as one atomic step: no other
   * change can run between the read and the write, so check-then-write races are impossible.
   * When `change` throws, nothing is written and the promise rejects with that error.
   */
  update<T>(change: (boards: readonly Board[]) => BoardChange<T>): Promise<T>;
}
