import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linuxAutostartEntry, linuxAutostartFile, migrateLinuxAutostart } from "../src/linux-autostart";

describe("linuxAutostartFile", () => {
  it("lives in the XDG autostart folder", () => {
    expect(linuxAutostartFile("/home/me", {})).toBe(join("/home/me", ".config", "autostart", "speed-deck.desktop"));
    expect(linuxAutostartFile("/home/me", { XDG_CONFIG_HOME: "/cfg" })).toBe(join("/cfg", "autostart", "speed-deck.desktop"));
  });
});

describe("linuxAutostartEntry", () => {
  it("starts the AppImage (not its temporary mount) hidden in the tray", () => {
    const entry = linuxAutostartEntry({ execPath: "/tmp/.mount_SpeedX/speed-deck", env: { APPIMAGE: "/home/me/Apps/Speed-Deck.AppImage" } });
    expect(entry).toContain("[Desktop Entry]\n");
    expect(entry).toContain("Type=Application\n");
    expect(entry).toContain("Name=Speed Deck\n");
    expect(entry).toContain('Exec="/home/me/Apps/Speed-Deck.AppImage" --hidden\n');
    expect(entry).toContain("X-GNOME-Autostart-enabled=true\n");
  });

  it("quotes paths with spaces and escapes reserved characters", () => {
    // Desktop Entry spec: escape " ` $ \ inside quotes, then escape that backslash again as a string value; % becomes %%.
    const entry = linuxAutostartEntry({ execPath: '/opt/Speed Deck/50%/speed-$deck"', env: {} });
    expect(entry).toContain('Exec="/opt/Speed Deck/50%%/speed-\\\\$deck\\\\"" --hidden\n');
  });
});

describe("migrateLinuxAutostart", () => {
  it("replaces the speak-bot.desktop entry of older versions with speed-deck.desktop, keeping Start at login on", async () => {
    const home = await mkdtemp(join(tmpdir(), "speed-deck-autostart-"));
    try {
      const folder = join(home, ".config", "autostart");
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "speak-bot.desktop"), "[Desktop Entry]\nName=Speak Bot\n");

      expect(await migrateLinuxAutostart(home, {}, "NEW ENTRY")).toBe(true);
      expect(await readdir(folder)).toEqual(["speed-deck.desktop"]);
      expect(await readFile(join(folder, "speed-deck.desktop"), "utf8")).toBe("NEW ENTRY");

      // Nothing to do afterwards, or when Start at login was off.
      expect(await migrateLinuxAutostart(home, {}, "OTHER")).toBe(false);
      expect(await readFile(join(folder, "speed-deck.desktop"), "utf8")).toBe("NEW ENTRY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
