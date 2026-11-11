import { ApplicationNotListedError, ApplicationOpenFailedError, type Application, type ApplicationLauncher } from "@speed-deck/core";
import { execFile as nodeExecFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";

export interface DirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

export interface MacApplicationLauncherOptions {
  /** The user's home folder, for `~/Applications`; defaults to os.homedir(). */
  homeDir?: string;
  /** Lists a folder; rejects when it cannot be read. */
  readDirectory?: (path: string) => Promise<DirectoryEntry[]>;
  /** Runs a program with an argument array (never through a shell); rejects when it fails. */
  execFile?: (file: string, args: readonly string[]) => Promise<void>;
}

const APP_SUFFIX = ".app";
/** `open` by its full path, so nothing on PATH can stand in for it. */
const OPEN_COMMAND = "/usr/bin/open";

async function readDirectoryEntries(path: string): Promise<DirectoryEntry[]> {
  const entries = await readdir(path, { withFileTypes: true });
  // Some applications are links to a bundle elsewhere.
  return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() || entry.isSymbolicLink() }));
}

function runFile(file: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    nodeExecFile(file, [...args], { shell: false }, (error) => (error ? reject(error) : resolve()));
  });
}

/**
 * The applications of a Mac: the `.app` bundles in /Applications, /System/Applications and ~/Applications,
 * at the top of each folder or one folder down (e.g. /Applications/Adobe Photoshop 2025/*.app). An id is the
 * absolute path of a bundle. Only a bundle listed right now can be opened, with `open -a <path>` and nothing
 * else: no arguments, no other paths, no shell.
 */
export class MacApplicationLauncher implements ApplicationLauncher {
  private readonly roots: readonly string[];
  private readonly readDirectory: (path: string) => Promise<DirectoryEntry[]>;
  private readonly execFile: (file: string, args: readonly string[]) => Promise<void>;

  constructor(options: MacApplicationLauncherOptions = {}) {
    this.roots = ["/Applications", "/System/Applications", `${options.homeDir ?? homedir()}/Applications`];
    this.readDirectory = options.readDirectory ?? readDirectoryEntries;
    this.execFile = options.execFile ?? runFile;
  }

  async list(): Promise<Application[]> {
    const found = new Map<string, Application>();
    for (const root of this.roots) {
      for (const entry of await this.entriesOf(root)) {
        if (!entry.isDirectory || entry.name.startsWith(".")) continue;
        const path = `${root}/${entry.name}`;
        if (isBundle(entry)) found.set(path, toApplication(path, entry.name));
        // One nested level: a folder that holds the bundle. Never inside a bundle.
        else for (const nested of await this.entriesOf(path)) if (isBundle(nested)) found.set(`${path}/${nested.name}`, toApplication(`${path}/${nested.name}`, nested.name));
      }
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
  }

  async open(id: string): Promise<void> {
    // The id comes from a stored key, which a phone may have written: it must be a bundle listed right now.
    const listed = (await this.list()).find((application) => application.id === id);
    if (!listed) throw new ApplicationNotListedError();
    try {
      await this.execFile(OPEN_COMMAND, ["-a", listed.id]);
    } catch (error) {
      throw new ApplicationOpenFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  /** A folder's entries; none when it is missing or cannot be read. */
  private entriesOf(path: string): Promise<DirectoryEntry[]> {
    return this.readDirectory(path).catch(() => []);
  }
}

function isBundle(entry: DirectoryEntry): boolean {
  return entry.isDirectory && !entry.name.startsWith(".") && entry.name.length > APP_SUFFIX.length && entry.name.endsWith(APP_SUFFIX);
}

function toApplication(id: string, bundleName: string): Application {
  return { id, name: bundleName.slice(0, -APP_SUFFIX.length) };
}
