import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HIDDEN_FLAG } from "./startup";

type Env = Readonly<Record<string, string | undefined>>;

/** `~/.config/autostart/speak-bot.desktop` (or under $XDG_CONFIG_HOME). */
export function linuxAutostartFile(homeDir: string, env: Env): string {
  return join(env.XDG_CONFIG_HOME || join(homeDir, ".config"), "autostart", "speak-bot.desktop");
}

/**
 * The autostart entry for this install. An AppImage runs from a temporary mount, so the
 * entry points at the AppImage file itself ($APPIMAGE) instead of the running binary.
 */
export function linuxAutostartEntry({ execPath, env }: { execPath: string; env: Env }): string {
  const target = env.APPIMAGE || execPath;
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Speak Bot",
    "Comment=Speak typed phrases out loud and show captions in OBS",
    `Exec=${quoteExecArgument(target)} ${HIDDEN_FLAG}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/** Quotes one Exec argument following the Desktop Entry specification. */
function quoteExecArgument(value: string): string {
  const quoted = value.replace(/["`$\\]/g, (char) => `\\${char}`);
  // Exec is also a string value, so every backslash is escaped once more; % starts a field code.
  return `"${quoted.replace(/\\/g, "\\\\").replace(/%/g, "%%")}"`;
}

export function isLinuxAutostartEnabled(file: string): boolean {
  return existsSync(file);
}

export async function setLinuxAutostart(file: string, enabled: boolean, entry: string): Promise<void> {
  if (!enabled) {
    await rm(file, { force: true });
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, entry, "utf8");
}
