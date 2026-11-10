import { DEFAULT_UI_LANGUAGE, type DesktopSettings } from "@speed-deck/core";
import { posix, win32 } from "node:path";
import { MAX_RATE, MIN_RATE } from "./adapters/json-file-settings-store";

export interface DesktopConfig {
  port: number;
  host: string;
  dataDir: string;
  /** The default data directory of versions named Speak Bot; copied to `dataDir` once. Absent when the data directory is explicit. */
  legacyDataDir?: string;
  /** Default settings; OBS connection defaults come from the settings store. */
  defaults: Omit<DesktopSettings, "obs">;
  /** Extra trusted Host names (lowercase), for users who reach the server through a custom DNS name. */
  allowedHosts: string[];
}

export interface ConfigSources {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  homeDir: string;
}

export const DEFAULT_PORT = 4545;
const ENV_PREFIX = "SPEED_DECK_";
/** Env var prefix and data directory name from when the app was called Speak Bot. */
const LEGACY_ENV_PREFIX = "SPEAK_BOT_";
const DATA_DIR_NAME = "speed-deck";
const LEGACY_DATA_DIR_NAME = "speak-bot";

/**
 * Reads configuration from CLI flags (`--port 4545` or `--port=4545`) and SPEED_DECK_* env vars;
 * the SPEAK_BOT_* names from before the rename are still read when the new one is not set.
 * Flags win over env vars. Supported: port, host, data-dir, voice, device, rate,
 * allowed-host (SPEED_DECK_ALLOWED_HOSTS, comma-separated).
 */
export function loadConfig({ argv, env, platform, homeDir }: ConfigSources): DesktopConfig {
  const flags = parseFlags(argv);
  const pick = (flag: string, name: string) => flags.get(flag) ?? env[`${ENV_PREFIX}${name}`] ?? env[`${LEGACY_ENV_PREFIX}${name}`];

  const port = Number(pick("port", "PORT") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${pick("port", "PORT")}`);

  const rate = Number(pick("rate", "RATE") ?? 1);
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) {
    throw new Error(`Invalid rate: ${pick("rate", "RATE")} (expected ${MIN_RATE}–${MAX_RATE})`);
  }

  const explicitDataDir = pick("data-dir", "DATA_DIR");
  const config: DesktopConfig = {
    port,
    host: pick("host", "HOST") ?? "0.0.0.0",
    dataDir: explicitDataDir ?? defaultDataDir(platform, env, homeDir, DATA_DIR_NAME),
    defaults: {
      voiceId: pick("voice", "VOICE") ?? "",
      rate,
      deviceId: pick("device", "DEVICE") ?? "",
      language: DEFAULT_UI_LANGUAGE,
      captionsVisible: true,
    },
    allowedHosts: (pick("allowed-host", "ALLOWED_HOSTS") ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host !== ""),
  };
  if (explicitDataDir === undefined) config.legacyDataDir = defaultDataDir(platform, env, homeDir, LEGACY_DATA_DIR_NAME);
  return config;
}

function defaultDataDir(platform: NodeJS.Platform, env: ConfigSources["env"], homeDir: string, name: string): string {
  switch (platform) {
    case "darwin":
      return posix.join(homeDir, "Library", "Application Support", name);
    case "win32":
      return win32.join(env.APPDATA ?? win32.join(homeDir, "AppData", "Roaming"), name);
    default:
      return posix.join(env.XDG_CONFIG_HOME ?? posix.join(homeDir, ".config"), name);
  }
}

function parseFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) continue;
    const equals = arg.indexOf("=");
    if (equals !== -1) flags.set(arg.slice(2, equals), arg.slice(equals + 1));
    else if (argv[index + 1] !== undefined) flags.set(arg.slice(2), argv[++index]!);
  }
  return flags;
}
