import { ApplicationNotListedError, ApplicationOpenFailedError, type Application, type ApplicationLauncher } from "@speed-deck/core";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { win32 } from "node:path";
import type { DirectoryEntry } from "./mac-application-launcher";

export interface WindowsApplicationLauncherOptions {
  /** Environment variables, for %ProgramData%, %AppData% and %SystemRoot%; defaults to process.env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Lists a folder; rejects when it cannot be read. */
  readDirectory?: (path: string) => Promise<DirectoryEntry[]>;
  /** Starts a program with an argument array (never through a shell); rejects when it cannot be started. */
  execFile?: (file: string, args: readonly string[]) => Promise<void>;
}

const SHORTCUT_SUFFIX = ".lnk";
const START_MENU_PROGRAMS = ["Microsoft", "Windows", "Start Menu", "Programs"];
/** Folders below a Start Menu root that are searched: vendor folders hold the shortcuts one or two levels down. */
const MAX_DEPTH = 3;
/** Shortcuts that uninstall or document an application rather than open it. */
const NOT_AN_APPLICATION = /uninstall|desinstal|readme|léame|leame/i;

async function readDirectoryEntries(path: string): Promise<DirectoryEntry[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
}

/**
 * Starts a program and resolves once it is running, without waiting for it to end: explorer.exe hands the
 * shortcut over and may exit with a non-zero code even when the application opened.
 */
function startFile(file: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { shell: false, detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * The applications of a Windows computer: the shortcuts (`.lnk`) of the Start Menu, for all users
 * (%ProgramData%) and for this user (%AppData%), up to three folders deep. These are the applications the
 * user sees in Start. An id is the absolute path of a shortcut. Only a shortcut listed right now can be opened,
 * with explorer.exe and the shortcut as its only argument: no other paths, no shell.
 */
export class WindowsApplicationLauncher implements ApplicationLauncher {
  private readonly roots: readonly string[];
  private readonly explorer: string;
  private readonly readDirectory: (path: string) => Promise<DirectoryEntry[]>;
  private readonly execFile: (file: string, args: readonly string[]) => Promise<void>;

  constructor(options: WindowsApplicationLauncherOptions = {}) {
    const env = options.env ?? process.env;
    this.roots = [env.ProgramData ?? env.PROGRAMDATA, env.APPDATA ?? env.AppData]
      .filter((base): base is string => Boolean(base))
      .map((base) => win32.join(base, ...START_MENU_PROGRAMS));
    this.explorer = win32.join(env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows", "explorer.exe");
    this.readDirectory = options.readDirectory ?? readDirectoryEntries;
    this.execFile = options.execFile ?? startFile;
  }

  async list(): Promise<Application[]> {
    // The same application often has a shortcut for all users and one for this user: show it once.
    const byName = new Map<string, Application>();
    for (const root of this.roots) {
      for (const application of await this.shortcutsIn(root, 0)) {
        const key = application.name.toLocaleLowerCase();
        if (!byName.has(key)) byName.set(key, application);
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
  }

  async open(id: string): Promise<void> {
    // The id comes from a stored key, which a phone may have written: it must be a shortcut listed right now.
    const listed = (await this.list()).find((application) => application.id === id);
    if (!listed) throw new ApplicationNotListedError();
    try {
      await this.execFile(this.explorer, [listed.id]);
    } catch (error) {
      throw new ApplicationOpenFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  private async shortcutsIn(folder: string, depth: number): Promise<Application[]> {
    const found: Application[] = [];
    for (const entry of await this.entriesOf(folder)) {
      if (entry.name.startsWith(".")) continue;
      const path = win32.join(folder, entry.name);
      if (entry.isDirectory) {
        if (depth + 1 < MAX_DEPTH) found.push(...(await this.shortcutsIn(path, depth + 1)));
      } else if (isApplicationShortcut(entry.name)) {
        found.push({ id: path, name: entry.name.slice(0, -SHORTCUT_SUFFIX.length) });
      }
    }
    return found;
  }

  /** A folder's entries; none when it is missing or cannot be read. */
  private entriesOf(path: string): Promise<DirectoryEntry[]> {
    return this.readDirectory(path).catch(() => []);
  }
}

function isApplicationShortcut(name: string): boolean {
  return (
    name.length > SHORTCUT_SUFFIX.length &&
    name.toLowerCase().endsWith(SHORTCUT_SUFFIX) &&
    !NOT_AN_APPLICATION.test(name.slice(0, -SHORTCUT_SUFFIX.length))
  );
}
