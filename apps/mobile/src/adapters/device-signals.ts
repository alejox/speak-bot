/** What the phone itself can do to get the person's attention, and what it knows about the computer. */
export interface DeviceSignals {
  /** Vibrates with a pattern of on and off durations in ms (starting with on); does nothing where it cannot. */
  vibrate(pattern: readonly number[]): void;
  /** The name of the computer this app is connected to, when the device knows it. */
  computerName(): string | null;
}

/** `window.SpeedDeckAndroidDevice`, added by the Android app (`DeviceBridge`). */
interface AndroidDeviceBridge {
  /** The pattern as comma-separated milliseconds; false when it was refused. */
  vibrate(pattern: string): boolean;
  /** Empty when not known. */
  computerName(): string;
}

const BRIDGE_NAME = "SpeedDeckAndroidDevice";

const isBridge = (value: unknown): value is AndroidDeviceBridge =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>).vibrate === "function" &&
  typeof (value as Record<string, unknown>).computerName === "function";

/** Android's vibrator inside the Android app (its WebView may not vibrate), else the browser's `navigator.vibrate`. */
export function createDeviceSignals(host: object = globalThis): DeviceSignals {
  const bridge = (host as Record<string, unknown>)[BRIDGE_NAME];
  if (isBridge(bridge)) {
    return {
      vibrate: (pattern) => {
        try {
          bridge.vibrate(pattern.map((ms) => Math.max(0, Math.round(ms))).join(","));
        } catch {
          // A vibration is a courtesy: never let it break the app.
        }
      },
      computerName: () => {
        try {
          const name = bridge.computerName();
          return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
        } catch {
          return null;
        }
      },
    };
  }
  const navigator = (host as { navigator?: { vibrate?: (pattern: number[]) => boolean } }).navigator;
  return {
    vibrate: (pattern) => {
      try {
        navigator?.vibrate?.([...pattern]);
      } catch {
        // Some browsers throw when vibration is blocked.
      }
    },
    computerName: () => null,
  };
}
