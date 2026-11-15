import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** The content a file held before its last change, kept next to it as `<file>.last-good`. */
export const LAST_GOOD_SUFFIX = ".last-good";
/** A damaged file is kept next to where it was as `<file>.corrupt-<time>`. */
export const CORRUPT_INFIX = ".corrupt-";
/** How many damaged copies of one file are kept; older ones are removed. */
export const MAX_CORRUPT_COPIES = 5;

const READ_ATTEMPTS = 3;
const READ_RETRY_MS = 40;

/** What happened to a file that could not be read or parsed. */
export interface JsonFileRecovery {
  /** The file that was damaged. */
  file: string;
  /** "restored": its last good copy was put back; "reset": there was no usable one, so the file starts over. */
  outcome: "restored" | "reset";
  /** Where the damaged content was kept. */
  damagedCopy: string;
  /** Epoch ms. */
  at: number;
}

export interface JsonFileOptions {
  now?: () => number;
  log?: (message: string) => void;
  /** Told about each recovery, after the file is safe again. */
  onRecovery?: (recovery: JsonFileRecovery) => void;
  /** Whether parsed content has the shape this store writes; content that does not counts as damaged. */
  isValid?: (value: unknown) => boolean;
  /**
   * False for a cache that can be built again: no last good copy is kept or put back. A damaged file is
   * still kept aside and writes are still durable.
   */
  lastGood?: boolean;
}

export type JsonFileContent =
  | { status: "missing" }
  /** `recovery` is set when the value is the last good copy, put back in place of a damaged file. */
  | { status: "ok"; value: unknown; recovery?: JsonFileRecovery }
  /** The file was damaged and had no usable last good copy: it was kept aside and starts over. */
  | { status: "corrupt"; recovery: JsonFileRecovery };

type Parsed = { status: "missing" } | { status: "ok"; value: unknown; raw: string } | { status: "damaged" };

/**
 * Reads a JSON file. One that cannot be read or parsed is never lost and never silently replaced: it is
 * kept as `<file>.corrupt-<time>` and the last good copy (`<file>.last-good`) is put back in its place;
 * without a usable one the file is removed, so the caller starts over. Each recovery is logged and reported.
 */
export async function readJsonFile(file: string, options: JsonFileOptions = {}): Promise<JsonFileContent> {
  const current = await readParsed(file, options.isValid);
  if (current.status === "missing") return current;
  if (current.status === "ok") return { status: "ok", value: current.value };
  return recover(file, options);
}

/**
 * Replaces the file without ever leaving it half-written: the new content goes to a temporary file that
 * is flushed to disk, the content being replaced is kept as `<file>.last-good`, and only then is the
 * temporary file renamed over the target (and the folder flushed, where the system allows it).
 */
export async function writeJsonFileAtomic(file: string, value: unknown, options: JsonFileOptions = {}): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = tempPath(file);
  try {
    await writeDurable(temp, `${JSON.stringify(value, null, 2)}\n`);
    await keepLastGood(file, options);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  await syncDirectory(dirname(file));
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

function tempPath(file: string): string {
  return `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
}

async function readParsed(file: string, isValid: JsonFileOptions["isValid"]): Promise<Parsed> {
  let raw: string;
  try {
    raw = await readWithRetry(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return { status: "damaged" };
  }
  try {
    const value = JSON.parse(raw) as unknown;
    return isValid && !isValid(value) ? { status: "damaged" } : { status: "ok", value, raw };
  } catch {
    return { status: "damaged" };
  }
}

/** A file another program holds for a moment (a virus scanner, a backup) is tried again before it counts as unreadable. */
async function readWithRetry(file: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || attempt >= READ_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, READ_RETRY_MS));
    }
  }
}

async function recover(file: string, options: JsonFileOptions): Promise<JsonFileContent> {
  const at = (options.now ?? Date.now)();
  // Read before anything moves: this is what will be put back.
  const lastGood: Parsed = options.lastGood === false ? { status: "missing" } : await readParsed(`${file}${LAST_GOOD_SUFFIX}`, options.isValid);
  // Throws when the damaged file cannot be kept; nothing is then written in its place.
  const damagedCopy = await keepDamaged(file, at);
  const name = basename(file);
  if (lastGood.status === "ok") {
    await replaceDurable(file, lastGood.raw);
    const recovery: JsonFileRecovery = { file, outcome: "restored", damagedCopy, at };
    options.log?.(`Data recovery: ${name} was damaged. Restored the last good copy (${name}${LAST_GOOD_SUFFIX}); the damaged file was kept at ${damagedCopy}.`);
    options.onRecovery?.(recovery);
    return { status: "ok", value: lastGood.value, recovery };
  }
  // Gone already when it had to be moved instead of copied.
  await rm(file, { force: true });
  await syncDirectory(dirname(file));
  const recovery: JsonFileRecovery = { file, outcome: "reset", damagedCopy, at };
  options.log?.(`Data recovery: ${name} was damaged and has no usable last good copy. Starting over with defaults; the damaged file was kept at ${damagedCopy}.`);
  options.onRecovery?.(recovery);
  return { status: "corrupt", recovery };
}

/**
 * Keeps the damaged file as `<file>.corrupt-<time>` and resolves with that path. An existing copy is never
 * overwritten, and only the newest `MAX_CORRUPT_COPIES` are kept. The time is ISO 8601 with "-" for ":",
 * which Windows does not allow in file names.
 */
async function keepDamaged(file: string, at: number): Promise<string> {
  const stamp = new Date(at).toISOString().replace(/:/g, "-");
  let target = "";
  for (let copy = 1; ; copy += 1) {
    target = `${file}${CORRUPT_INFIX}${stamp}${copy === 1 ? "" : `-${copy}`}`;
    try {
      await copyFile(file, target, constants.COPYFILE_EXCL);
      await syncFile(target);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      // Its content cannot be read to copy it: move the file itself aside (over nothing but the partial copy).
      await rename(file, target);
      break;
    }
  }
  await syncDirectory(dirname(file));
  await pruneDamagedCopies(file);
  return target;
}

async function pruneDamagedCopies(file: string): Promise<void> {
  const dir = dirname(file);
  const prefix = `${basename(file)}${CORRUPT_INFIX}`;
  try {
    const copies = (await readdir(dir)).filter((name) => name.startsWith(prefix)).sort(byTimeThenCopy(prefix));
    for (const name of copies.slice(0, Math.max(0, copies.length - MAX_CORRUPT_COPIES))) await rm(join(dir, name), { recursive: true, force: true });
  } catch {
    // Too many copies is only clutter; never a reason to fail a recovery.
  }
}

/** Oldest first: by timestamp, then by the copy number given to copies made in the same millisecond. */
function byTimeThenCopy(prefix: string): (a: string, b: string) => number {
  const parts = (name: string) => {
    const [, stamp = "", copy = "1"] = /^(.*?Z)(?:-(\d+))?$/.exec(name.slice(prefix.length)) ?? [];
    return { stamp, copy: Number(copy) };
  };
  return (a, b) => {
    const [left, right] = [parts(a), parts(b)];
    return left.stamp === right.stamp ? left.copy - right.copy : left.stamp < right.stamp ? -1 : 1;
  };
}

/**
 * Before the file is replaced: its current content becomes `<file>.last-good` (atomically), so one damaged
 * write can always be undone. A current file that is itself damaged is kept aside instead and the last good
 * copy is left alone. Failing to keep the last good copy is logged but does not stop the save the person
 * asked for; failing to keep a damaged file does.
 */
async function keepLastGood(file: string, options: JsonFileOptions): Promise<void> {
  const current = await readParsed(file, options.isValid);
  if (current.status === "missing") return;
  if (current.status === "damaged") {
    const damagedCopy = await keepDamaged(file, (options.now ?? Date.now)());
    options.log?.(`Data recovery: ${basename(file)} was damaged when it was about to be saved; the damaged file was kept at ${damagedCopy}.`);
    return;
  }
  if (options.lastGood === false) return;
  try {
    await replaceDurable(`${file}${LAST_GOOD_SUFFIX}`, current.raw);
  } catch (error) {
    options.log?.(`Could not keep the last good copy of ${basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Writes `text` to a temporary file, flushes it, and renames it over `file`. */
async function replaceDurable(file: string, text: string): Promise<void> {
  const temp = tempPath(file);
  try {
    await writeDurable(temp, text);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  await syncDirectory(dirname(file));
}

/** Writes and flushes to disk (fsync), so the content survives a power cut once this resolves. */
async function writeDurable(file: string, text: string): Promise<void> {
  const handle = await open(file, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncFile(file: string): Promise<void> {
  const handle = await open(file, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Flushes a rename to disk. Windows cannot open a folder to flush it; there (and anywhere it fails) this does nothing. */
async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Not supported here: the rename itself already happened.
  }
}
