import { assignMissingSlots, initializeBoards, type BoardRepository, type Phrase, type StoredPhrase, type UiLanguage } from "@speak-bot/core";
import { rename } from "node:fs/promises";
import { readJsonFile } from "./json-file";

export type PrepareBoardsResult = "unchanged" | "migrated" | "created-default";

/**
 * Makes sure there is at least one board. On the first start after an update, the phrases saved by
 * older versions (`legacyPhrasesFile`) become the communication board and the old file is kept as
 * `<file>.migrated.bak`. A new install gets the default communication board in `language`.
 */
export async function prepareBoards(
  repository: BoardRepository,
  { legacyPhrasesFile, language }: { legacyPhrasesFile: string; language: UiLanguage },
): Promise<PrepareBoardsResult> {
  if ((await repository.list()).length > 0) return "unchanged";
  const legacyPhrases = await readLegacyPhrases(legacyPhrasesFile);
  const created = await initializeBoards({ repository }, { language, legacyPhrases });
  if (!created) return "unchanged";
  if (legacyPhrases === null) return "created-default";
  await rename(legacyPhrasesFile, `${legacyPhrasesFile}.migrated.bak`);
  return "migrated";
}

/** Phrases from an older phrases file (slots assigned when missing), or null when there is no readable file. */
async function readLegacyPhrases(file: string): Promise<Phrase[] | null> {
  const content = await readJsonFile(file);
  if (content.status !== "ok" || !Array.isArray(content.value)) return null;
  return assignMissingSlots(content.value.filter(isStoredPhrase));
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
