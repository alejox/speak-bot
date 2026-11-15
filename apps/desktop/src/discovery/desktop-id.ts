import { readJsonFile, writeJsonFileAtomic, type JsonFileOptions } from "../adapters/json-file";

/**
 * The id that identifies this computer to phones across restarts and IP address changes.
 * Saved in `file` (`desktop.json` in the data directory) the first time it is needed.
 */
export async function loadOrCreateDesktopId(file: string, generateId: () => string, options: Pick<JsonFileOptions, "log"> = {}): Promise<string> {
  const content = await readJsonFile(file, options);
  if (content.status === "ok" && typeof content.value === "object" && content.value !== null) {
    const { id } = content.value as Record<string, unknown>;
    if (typeof id === "string" && id !== "") return id;
  }
  const id = generateId();
  await writeJsonFileAtomic(file, { id }, options);
  return id;
}
