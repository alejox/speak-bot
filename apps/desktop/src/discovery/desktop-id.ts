import { readJsonFile, writeJsonFileAtomic } from "../adapters/json-file";

/**
 * The id that identifies this computer to phones across restarts and IP address changes.
 * Saved in `file` (`desktop.json` in the data directory) the first time it is needed.
 */
export async function loadOrCreateDesktopId(file: string, generateId: () => string): Promise<string> {
  const content = await readJsonFile(file);
  if (content.status === "ok" && typeof content.value === "object" && content.value !== null) {
    const { id } = content.value as Record<string, unknown>;
    if (typeof id === "string" && id !== "") return id;
  }
  const id = generateId();
  await writeJsonFileAtomic(file, { id });
  return id;
}
