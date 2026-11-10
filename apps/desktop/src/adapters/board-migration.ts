import {
  assignMissingSlots,
  createKey,
  initializeBoards,
  moveCaptionKeysToVoiceBoards,
  type BoardRepository,
  type CaptionMigrationReport,
  type Phrase,
  type StoredPhrase,
  type UiLanguage,
} from "@speed-deck/core";
import { rename } from "node:fs/promises";
import { readJsonFile } from "./json-file";

export type PrepareBoardsResult = "unchanged" | "migrated" | "created-default";

/**
 * Makes sure there is at least one board. On the first start after an update, the phrases saved by
 * older versions (`legacyPhrasesFile`) become the communication board and the old file is kept as
 * `<file>.migrated.bak`. A new install gets the default communication board in `language`. Either
 * way the default deck board follows it. Boards stored before boards had a kind are not handled
 * here: `readStoredBoards` gives them one on every read, and the next change stores the result.
 * Caption keys stored on deck boards by earlier versions move to Voice (see `moveCaptionKeysToVoice`),
 * stored once and described in `log`. Phrases a key cannot hold (e.g. text over the speech limit) are skipped and counted in `log`,
 * so an old file never stops the desktop from starting.
 */
export async function prepareBoards(
  repository: BoardRepository,
  { legacyPhrasesFile, language, log = () => {} }: { legacyPhrasesFile: string; language: UiLanguage; log?: (message: string) => void },
): Promise<PrepareBoardsResult> {
  if ((await repository.list()).length > 0) {
    logCaptionMigration(await moveCaptionKeysToVoiceBoards({ repository }, { language }), log);
    return "unchanged";
  }
  const legacyPhrases = await readLegacyPhrases(legacyPhrasesFile, log);
  const created = await initializeBoards({ repository }, { language, legacyPhrases });
  if (!created) return "unchanged";
  if (legacyPhrases === null) return "created-default";
  await rename(legacyPhrasesFile, `${legacyPhrasesFile}.migrated.bak`);
  return "migrated";
}

function logCaptionMigration({ moved, dropped, kept, createdBoardId }: CaptionMigrationReport, log: (message: string) => void): void {
  const keys = (count: number) => `${count} caption key${count === 1 ? "" : "s"}`;
  if (createdBoardId !== null) log(`Created the communication board (${createdBoardId}) to hold the caption keys.`);
  if (moved.length > 0) log(`Moved ${keys(moved.length)} from deck boards to Voice (${moved[0]!.toBoardId}).`);
  if (dropped.length > 0) log(`Removed ${keys(dropped.length)} from deck boards: Voice already has them.`);
  if (kept.length > 0) log(`Kept ${keys(kept.length)} on deck boards: no Voice board has room for them.`);
}

/** Phrases from an older phrases file (slots assigned when missing), or null when there is no readable file. */
async function readLegacyPhrases(file: string, log: (message: string) => void): Promise<Phrase[] | null> {
  const content = await readJsonFile(file);
  if (content.status !== "ok" || !Array.isArray(content.value)) return null;
  const phrases = assignMissingSlots(content.value.filter(isStoredPhrase));
  const usable = phrases.filter(fitsOnKey);
  const skipped = phrases.length - usable.length;
  if (skipped > 0) log(`Skipped ${skipped} saved phrase${skipped === 1 ? "" : "s"} that a board key cannot hold.`);
  return usable;
}

/** Whether the phrase makes a valid speak key in its slot (text length, slot range). */
function fitsOnKey(phrase: Phrase): boolean {
  try {
    createKey({ slot: phrase.slot, action: { type: "voice.speak", text: phrase.text.trim() } });
    return true;
  } catch {
    return false;
  }
}

function isStoredPhrase(value: unknown): value is StoredPhrase {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    candidate.text.trim() !== "" &&
    typeof candidate.createdAt === "number" &&
    (candidate.label === undefined || typeof candidate.label === "string") &&
    (candidate.slot === undefined || typeof candidate.slot === "number")
  );
}
