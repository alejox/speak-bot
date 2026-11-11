import { ApplicationNotListedError, ApplicationsUnsupportedError } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { createApplicationLauncher } from "../src/adapters/apps/create-application-launcher";
import { MacApplicationLauncher, type DirectoryEntry } from "../src/adapters/apps/mac-application-launcher";

const dir = (name: string): DirectoryEntry => ({ name, isDirectory: true });
const file = (name: string): DirectoryEntry => ({ name, isDirectory: false });

/** A disk with apps at the top of each folder, inside one nested folder, and too deep to be found. */
const DISK: Record<string, DirectoryEntry[]> = {
  "/Applications": [dir("Safari.app"), dir("Adobe Photoshop 2025"), dir("Utilities"), dir(".hidden"), file("notes.txt"), dir("DaVinci Resolve")],
  "/Applications/Adobe Photoshop 2025": [dir("Adobe Photoshop 2025.app"), dir("Plug-ins"), file("Uninstall.txt")],
  "/Applications/Adobe Photoshop 2025/Plug-ins": [dir("Too Deep.app")],
  "/Applications/DaVinci Resolve": [dir("DaVinci Resolve.app")],
  "/Applications/Utilities": [],
  "/Applications/.hidden": [dir("Hidden.app")],
  "/System/Applications": [dir("Calculator.app")],
  "/Users/ana/Applications": [dir("anki.app")],
};

function launcher(disk = DISK) {
  const runs: Array<{ file: string; args: readonly string[] }> = [];
  const read: string[] = [];
  const mac = new MacApplicationLauncher({
    homeDir: "/Users/ana",
    readDirectory: async (path) => {
      read.push(path);
      const entries = disk[path];
      if (!entries) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return entries;
    },
    execFile: async (fileName, args) => void runs.push({ file: fileName, args }),
  });
  return { mac, runs, read };
}

describe("MacApplicationLauncher", () => {
  it("lists the app bundles of the three folders, one nested level deep, sorted by name", async () => {
    const { mac, read } = launcher();
    expect(await mac.list()).toEqual([
      { id: "/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app", name: "Adobe Photoshop 2025" },
      { id: "/Users/ana/Applications/anki.app", name: "anki" },
      { id: "/System/Applications/Calculator.app", name: "Calculator" },
      { id: "/Applications/DaVinci Resolve/DaVinci Resolve.app", name: "DaVinci Resolve" },
      { id: "/Applications/Safari.app", name: "Safari" },
    ]);
    // Never inside a bundle, a hidden folder or a second nested level.
    expect(read).not.toContain("/Applications/Safari.app");
    expect(read).not.toContain("/Applications/.hidden");
    expect(read).not.toContain("/Applications/Adobe Photoshop 2025/Plug-ins");
  });

  it("skips a folder that is missing", async () => {
    const { mac } = launcher({ "/Applications": [dir("Safari.app")] });
    expect(await mac.list()).toEqual([{ id: "/Applications/Safari.app", name: "Safari" }]);
  });

  it("opens a listed application with open -a and an argument array", async () => {
    const { mac, runs } = launcher();
    await mac.open("/Applications/DaVinci Resolve/DaVinci Resolve.app");
    expect(runs).toEqual([{ file: "/usr/bin/open", args: ["-a", "/Applications/DaVinci Resolve/DaVinci Resolve.app"] }]);
  });

  it.each([
    "/Applications/Missing.app",
    "/Applications/Safari.app/../../bin/sh",
    "/bin/sh",
    "Safari",
    "/Applications/Safari.app --args evil",
    "https://example.com",
    "/Applications/Adobe Photoshop 2025/Plug-ins/Too Deep.app",
    "",
  ])("refuses %j, which is not one of the listed bundles, without running anything", async (id) => {
    const { mac, runs } = launcher();
    await expect(mac.open(id)).rejects.toBeInstanceOf(ApplicationNotListedError);
    expect(runs).toEqual([]);
  });
});

describe("createApplicationLauncher", () => {
  it("lists nothing and refuses to open anything on other systems", async () => {
    for (const platform of ["win32", "linux"] as const) {
      const other = createApplicationLauncher(platform);
      expect(await other.list()).toEqual([]);
      await expect(other.open("/Applications/Safari.app")).rejects.toBeInstanceOf(ApplicationsUnsupportedError);
    }
    expect(createApplicationLauncher("darwin")).toBeInstanceOf(MacApplicationLauncher);
  });
});
