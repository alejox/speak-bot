import type { Board, Phrase, PhraseRepository } from "@speak-bot/core";
import type { DesktopApiClient } from "./desktop-api";

const ID_PREFIX = "slot-";

/**
 * Bridge for the phrase deck while it is replaced by the board editor: the `voice.speak` keys of the
 * first desktop board, seen as phrases. Ids are `slot-<n>`. Other keys are left untouched.
 */
export class RemotePhraseRepository implements PhraseRepository {
  private boardId: string | undefined;

  constructor(private readonly api: DesktopApiClient) {}

  async list(): Promise<Phrase[]> {
    const board = (await this.api.listBoards())[0];
    this.boardId = board?.id;
    return board ? phrasesOf(board) : [];
  }

  /** Puts the phrase into an empty key; a key filled meanwhile rejects with code "slot-occupied". */
  async save(phrase: Phrase): Promise<void> {
    await this.api.setKey(await this.currentBoardId(), phrase.slot, keyOf(phrase));
  }

  async update(phrase: Phrase): Promise<void> {
    const boardId = await this.currentBoardId();
    const from = slotOf(phrase.id);
    if (from !== null && from !== phrase.slot) await this.api.moveKey(boardId, from, phrase.slot);
    await this.api.setKey(boardId, phrase.slot, { ...keyOf(phrase), label: phrase.label ?? "" }, { replace: true });
  }

  async delete(id: string): Promise<void> {
    const slot = slotOf(id);
    if (slot !== null) await this.api.clearKey(await this.currentBoardId(), slot);
  }

  /**
   * Not supported remotely: the desktop restores its communication board atomically through
   * `DesktopApiClient.restoreDefaultBoard` (POST /api/boards/restore-default).
   */
  async replaceAll(_phrases: Phrase[]): Promise<void> {
    throw new Error("RemotePhraseRepository cannot replace all phrases; use DesktopApiClient.restoreDefaultBoard instead.");
  }

  private async currentBoardId(): Promise<string> {
    if (this.boardId === undefined) await this.list();
    if (this.boardId === undefined) throw new Error("The desktop has no board.");
    return this.boardId;
  }
}

function phrasesOf(board: Board): Phrase[] {
  return board.keys.flatMap((key) =>
    key.action.type === "voice.speak"
      ? [{ id: `${ID_PREFIX}${key.slot}`, text: key.action.text, ...(key.label ? { label: key.label } : {}), slot: key.slot, createdAt: key.slot }]
      : [],
  );
}

function keyOf(phrase: Phrase) {
  return { ...(phrase.label ? { label: phrase.label } : {}), action: { type: "voice.speak" as const, text: phrase.text } };
}

function slotOf(id: string): number | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const slot = Number(id.slice(ID_PREFIX.length));
  return Number.isInteger(slot) ? slot : null;
}
