import type { DesktopSettings } from "@speak-bot/core";
import { posix, win32 } from "node:path";
import { MAX_RATE, MIN_RATE } from "./adapters/json-file-settings-store";

export interface DesktopConfig {
  port: number;
  host: string;
  dataDir: string;
  /** Used until the user saves settings from the app. */
  defaults: DesktopSettings;
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

/**
 * Reads configuration from CLI flags (`--port 4545` or `--port=4545`) and SPEAK_BOT_* env vars.
 * Flags win over env vars. Supported: port, host, data-dir, voice, device, rate,
 * allowed-host (SPEAK_BOT_ALLOWED_HOSTS, comma-separated).
 */
export function loadConfig({ argv, env, platform, homeDir }: ConfigSources): DesktopConfig {
  const flags = parseFlags(argv);
  const pick = (flag: string, envName: string) => flags.get(flag) ?? env[envName];

  const port = Number(pick("port", "SPEAK_BOT_PORT") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${pick("port", "SPEAK_BOT_PORT")}`);

  const rate = Number(pick("rate", "SPEAK_BOT_RATE") ?? 1);
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) {
    throw new Error(`Invalid rate: ${pick("rate", "SPEAK_BOT_RATE")} (expected ${MIN_RATE}–${MAX_RATE})`);
  }

  return {
    port,
    host: pick("host", "SPEAK_BOT_HOST") ?? "0.0.0.0",
    dataDir: pick("data-dir", "SPEAK_BOT_DATA_DIR") ?? defaultDataDir(platform, env, homeDir),
    defaults: {
      voiceId: pick("voice", "SPEAK_BOT_VOICE") ?? "",
      rate,
      deviceId: pick("device", "SPEAK_BOT_DEVICE") ?? "",
    },
    allowedHosts: (pick("allowed-host", "SPEAK_BOT_ALLOWED_HOSTS") ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host !== ""),
  };
}

function defaultDataDir(platform: NodeJS.Platform, env: ConfigSources["env"], homeDir: string): string {
  switch (platform) {
    case "darwin":
      return posix.join(homeDir, "Library", "Application Support", "speak-bot");
    case "win32":
      return win32.join(env.APPDATA ?? win32.join(homeDir, "AppData", "Roaming"), "speak-bot");
    default:
      return posix.join(env.XDG_CONFIG_HOME ?? posix.join(homeDir, ".config"), "speak-bot");
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
