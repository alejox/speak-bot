import { MAX_ADS_DEVICE_ID_LENGTH, MAX_ADS_DEVICE_NAME_LENGTH } from "@speed-deck/core";
import { createId } from "../app/create-id";
import { getLocalStorage, readJson, writeJson } from "./browser-storage";

/** What tells a computer which phone reported a "remove ads" purchase, and what it shows for it. */
export interface DeviceIdentity {
  id: string;
  name: string;
}

export const DEVICE_ID_STORAGE_KEY = "speed-deck:device-id";
const BRIDGE_NAME = "SpeedDeckAndroidDevice";
const FALLBACK_NAME = "Android";
/** The ids the computer accepts (`parseAdsPurchaseReport`). */
const VALID_ID = new RegExp(`^[A-Za-z0-9._-]{8,${MAX_ADS_DEVICE_ID_LENGTH}}$`);

/**
 * This phone's identity: the Android app's installation id and the phone's maker and model
 * (`DeviceBridge.deviceId` / `deviceName`). An app that gives no id (an older build) gets one made once and
 * kept in this page's storage, which is per computer address. Null when no id can be kept.
 */
export function findDeviceIdentity(host: object = globalThis, storage: Storage | null = getLocalStorage(), generateId: () => string = createId): DeviceIdentity | null {
  const bridge = (host as Record<string, unknown>)[BRIDGE_NAME];
  const name = (ask(bridge, "deviceName")?.trim().slice(0, MAX_ADS_DEVICE_NAME_LENGTH) ?? "") || FALLBACK_NAME;
  const fromApp = ask(bridge, "deviceId");
  if (fromApp !== null && VALID_ID.test(fromApp)) return { id: fromApp, name };

  const stored = readJson(storage, DEVICE_ID_STORAGE_KEY);
  if (typeof stored === "string" && VALID_ID.test(stored)) return { id: stored, name };
  const created = generateId();
  if (!storage || !VALID_ID.test(created)) return null;
  writeJson(storage, DEVICE_ID_STORAGE_KEY, created);
  // Storage that refuses the write would hand out a new id on every visit.
  return readJson(storage, DEVICE_ID_STORAGE_KEY) === created ? { id: created, name } : null;
}

/** The string a bridge method answers, or null when the bridge lacks it, throws or answers something else. */
function ask(bridge: unknown, method: string): string | null {
  if (typeof bridge !== "object" || bridge === null) return null;
  const call = (bridge as Record<string, unknown>)[method];
  if (typeof call !== "function") return null;
  try {
    const answer: unknown = call.call(bridge);
    return typeof answer === "string" ? answer : null;
  } catch {
    return null;
  }
}
