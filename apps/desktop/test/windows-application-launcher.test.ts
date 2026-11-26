import { ApplicationNotListedError, ApplicationOpenFailedError } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import type { DirectoryEntry } from "../src/adapters/apps/mac-application-launcher";
import { WindowsApplicationLauncher } from "../src/adapters/apps/windows-application-launcher";

const dir = (name: string): DirectoryEntry => ({ name, isDirectory: true });
const file = (name: string): DirectoryEntry => ({ name, isDirectory: false });

const ALL = "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs";
const MINE = "C:\\Users\\ana\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs";

/** Start Menu shortcuts for all users and for this user, nested in vendor folders, with clutter around them. */
const DISK: Record<string, DirectoryEntry[]> = {
  [ALL]: [file("OBS Studio.lnk"), dir("Blackmagic Design"), dir("Accessories"), file("desktop.ini"), dir("Deep")],
  [`${ALL}\\Blackmagic Design`]: [dir("DaVinci Resolve")],
  [`${ALL}\\Blackmagic Design\\DaVinci Resolve`]: [file("DaVinci Resolve.lnk"), file("Uninstall DaVinci Resolve.lnk"), file("ReadMe.lnk")],
  [`${ALL}\\Accessories`]: [file("Notepad.LNK")],
  [`${ALL}\\Deep`]: [dir("Deeper")],
  [`${ALL}\\Deep\\Deeper`]: [dir("Too Deep")],
  [`${ALL}\\Deep\\Deeper\\Too Deep`]: [file("Hidden Away.lnk")],
  [MINE]: [file("Discord.lnk"), file("obs studio.lnk"), file("notes.txt")],
};

const ENV = { ProgramData: "C:\\ProgramData", APPDATA: "C:\\Users\\ana\\AppData\\Roaming", SystemRoot: "C:\\Windows" };

function launcher(disk = DISK) {
  const runs: Array<{ file: string; args: readonly string[] }> = [];
  const windows = new WindowsApplicationLauncher({
    env: ENV,
    readDirectory: async (path) => {
      const entries = disk[path];
      if (!entries) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return entries;
    },
    execFile: async (fileName, args) => void runs.push({ file: fileName, args }),
  });
  return { windows, runs };
}

describe("WindowsApplicationLauncher", () => {
  it("lists the Start Menu shortcuts of all users and of this user, once per name, sorted by name", async () => {
    const { windows } = launcher();
    expect(await windows.list()).toEqual([
      { id: `${ALL}\\Blackmagic Design\\DaVinci Resolve\\DaVinci Resolve.lnk`, name: "DaVinci Resolve" },
      { id: `${MINE}\\Discord.lnk`, name: "Discord" },
      { id: `${ALL}\\Accessories\\Notepad.LNK`, name: "Notepad" },
      { id: `${ALL}\\OBS Studio.lnk`, name: "OBS Studio" },
    ]);
  });

  it("skips a Start Menu folder that is missing", async () => {
    const { windows } = launcher({ [MINE]: [file("Discord.lnk")] });
    expect(await windows.list()).toEqual([{ id: `${MINE}\\Discord.lnk`, name: "Discord" }]);
  });

  it("lists nothing without the Start Menu environment variables", async () => {
    const windows = new WindowsApplicationLauncher({ env: {}, readDirectory: async () => [file("X.lnk")] });
    expect(await windows.list()).toEqual([]);
  });

  it("opens a listed shortcut with explorer.exe and the shortcut as its only argument", async () => {
    const { windows, runs } = launcher();
    const id = `${ALL}\\Blackmagic Design\\DaVinci Resolve\\DaVinci Resolve.lnk`;
    await windows.open(id);
    expect(runs).toEqual([{ file: "C:\\Windows\\explorer.exe", args: [id] }]);
  });

  it("reports a shortcut that could not be started", async () => {
    const windows = new WindowsApplicationLauncher({
      env: ENV,
      readDirectory: async (path) => DISK[path] ?? [],
      execFile: async () => {
        throw new Error("spawn failed");
      },
    });
    await expect(windows.open(`${ALL}\\OBS Studio.lnk`)).rejects.toBeInstanceOf(ApplicationOpenFailedError);
  });

  it.each([
    `${ALL}\\Missing.lnk`,
    `${ALL}\\Blackmagic Design\\DaVinci Resolve\\Uninstall DaVinci Resolve.lnk`,
    `${ALL}\\Deep\\Deeper\\Too Deep\\Hidden Away.lnk`,
    `${MINE}\\obs studio.lnk`,
    `${ALL}\\..\\..\\..\\..\\Windows\\System32\\cmd.exe`,
    "C:\\Windows\\System32\\cmd.exe",
    `${ALL}\\OBS Studio.lnk --evil`,
    "https://example.com",
    "",
  ])("refuses %j, which is not one of the listed shortcuts, without running anything", async (id) => {
    const { windows, runs } = launcher();
    await expect(windows.open(id)).rejects.toBeInstanceOf(ApplicationNotListedError);
    expect(runs).toEqual([]);
  });
});
