import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linuxAutostartEntry, linuxAutostartFile } from "../src/linux-autostart";

describe("linuxAutostartFile", () => {
  it("lives in the XDG autostart folder", () => {
    expect(linuxAutostartFile("/home/me", {})).toBe(join("/home/me", ".config", "autostart", "speak-bot.desktop"));
    expect(linuxAutostartFile("/home/me", { XDG_CONFIG_HOME: "/cfg" })).toBe(join("/cfg", "autostart", "speak-bot.desktop"));
  });
});

describe("linuxAutostartEntry", () => {
  it("starts the AppImage (not its temporary mount) hidden in the tray", () => {
    const entry = linuxAutostartEntry({ execPath: "/tmp/.mount_SpeakX/speak-bot", env: { APPIMAGE: "/home/me/Apps/Speak-Bot.AppImage" } });
    expect(entry).toContain("[Desktop Entry]\n");
    expect(entry).toContain("Type=Application\n");
    expect(entry).toContain("Name=Speak Bot\n");
    expect(entry).toContain('Exec="/home/me/Apps/Speak-Bot.AppImage" --hidden\n');
    expect(entry).toContain("X-GNOME-Autostart-enabled=true\n");
  });

  it("quotes paths with spaces and escapes reserved characters", () => {
    // Desktop Entry spec: escape " ` $ \ inside quotes, then escape that backslash again as a string value; % becomes %%.
    const entry = linuxAutostartEntry({ execPath: '/opt/Speak Bot/50%/speak-$bot"', env: {} });
    expect(entry).toContain('Exec="/opt/Speak Bot/50%%/speak-\\\\$bot\\\\"" --hidden\n');
  });
});
