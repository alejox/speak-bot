import { cp, rename, rm, stat } from "node:fs/promises";

export type LegacyDataDirResult = "copied" | "unchanged" | "failed";

/**
 * On the first start after the rename to Speed Deck, copies the data directory older versions used
 * (`legacyDataDir`, e.g. `speak-bot`) to `dataDir`. The old directory is kept, so going back to an
 * older version still finds its data. Nothing happens once `dataDir` exists. The copy goes to a
 * temporary sibling first, so an interrupted copy is retried on the next start. Never throws.
 */
export async function migrateLegacyDataDir(
  { dataDir, legacyDataDir }: { dataDir: string; legacyDataDir?: string },
  log: (message: string) => void,
): Promise<LegacyDataDirResult> {
  if (!legacyDataDir || legacyDataDir === dataDir) return "unchanged";
  if ((await kindOf(dataDir)) !== "missing" || (await kindOf(legacyDataDir)) !== "directory") return "unchanged";

  const staging = `${dataDir}.migrating`;
  try {
    await rm(staging, { recursive: true, force: true });
    await cp(legacyDataDir, staging, { recursive: true, errorOnExist: true, force: false });
    await rename(staging, dataDir);
    log(`Copied the data from ${legacyDataDir} to ${dataDir}; the old folder was kept.`);
    return "copied";
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    log(`Could not copy the data from ${legacyDataDir} to ${dataDir}: ${String(error)}`);
    return "failed";
  }
}

async function kindOf(path: string): Promise<"missing" | "directory" | "other"> {
  try {
    return (await stat(path)).isDirectory() ? "directory" : "other";
  } catch {
    return "missing";
  }
}
