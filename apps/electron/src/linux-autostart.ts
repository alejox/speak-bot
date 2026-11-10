import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HIDDEN_FLAG } from "./startup";

type Env = Readonly<Record<string, string | undefined>>;

/** `~/.config/autostart/speed-deck.desktop` (or under $XDG_CONFIG_HOME). */
export function linuxAutostartFile(homeDir: string, env: Env): string {
  return join(autostartFolder(homeDir, env), "speed-deck.desktop");
}

/** The entry versions named Speak Bot wrote. */
function legacyLinuxAutostartFile(homeDir: string, env: Env): string {
  return join(autostartFolder(homeDir, env), "speak-bot.desktop");
}

function autostartFolder(homeDir: string, env: Env): string {
  return join(env.XDG_CONFIG_HOME || join(homeDir, ".config"), "autostart");
}

/**
 * When an older version turned on Start at login, replaces its `speak-bot.desktop` entry with
 * `speed-deck.desktop` (`entry`), so the setting survives the rename. Resolves true when it did.
 */
export async function migrateLinuxAutostart(homeDir: string, env: Env, entry: string): Promise<boolean> {
  const legacy = legacyLinuxAutostartFile(homeDir, env);
  if (!existsSync(legacy)) return false;
  await setLinuxAutostart(linuxAutostartFile(homeDir, env), true, entry);
  await rm(legacy, { force: true });
  return true;
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
    "Name=Speed Deck",
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
