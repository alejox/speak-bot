import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonFileContent = { status: "missing" } | { status: "ok"; value: unknown } | { status: "corrupt" };

/** Reads a JSON file. A file that cannot be parsed is renamed to `<file>.bak` so it is never lost. */
export async function readJsonFile(file: string): Promise<JsonFileContent> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    throw error;
  }
  try {
    return { status: "ok", value: JSON.parse(raw) as unknown };
  } catch {
    await rename(file, `${file}.bak`);
    return { status: "corrupt" };
  }
}

/** Writes to a temporary file and renames it over the target, so a crash never leaves a half-written file. */
export async function writeJsonFileAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Serialises async operations so read-modify-write cycles never interleave. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
