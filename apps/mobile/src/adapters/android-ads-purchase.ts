import type { AdsEntitlement, AdsPurchase, AdsPurchaseState } from "@speed-deck/core";

/** `window.SpeedDeckAndroidBilling`, added by the Android app (`BillingBridge`): Google Play's "remove ads" product. */
interface AndroidBillingBridge {
  /** JSON `{ available, entitlement, price }`; price "" while Google Play has not told it. */
  state(): string;
  /** Opens Google Play's purchase sheet; false when there is nothing to buy. */
  purchase(): boolean;
  /** Asks Google Play again what the account owns; the answer arrives as an event. */
  restore(): void;
}

const BRIDGE_NAME = "SpeedDeckAndroidBilling";
/** The Android app calls it with the new state each time it changes. */
const EVENT_CALLBACK_NAME = "__speedDeckAndroidBillingEvent";
const ENTITLEMENTS: readonly AdsEntitlement[] = ["unknown", "not-owned", "pending", "owned"];
const UNKNOWN: AdsPurchaseState = { available: false, entitlement: "unknown", price: null };

/**
 * The "remove ads" purchase on Google Play, when this page runs inside the Speed Deck Android app (served
 * by the computer or bundled in the app); undefined anywhere else. Installs the global callback the app
 * calls with each new state.
 */
export function findAndroidAdsPurchase(target: object = globalThis): AdsPurchase | undefined {
  const host = target as Record<string, unknown>;
  const bridge = host[BRIDGE_NAME];
  if (!isBridge(bridge)) return undefined;

  const listeners = new Set<(state: AdsPurchaseState) => void>();
  host[EVENT_CALLBACK_NAME] = (event: unknown) => {
    const state = toState(event);
    if (!state) return;
    for (const listener of [...listeners]) listener(state);
  };
  return {
    getState: () => {
      try {
        return toState(JSON.parse(bridge.state())) ?? UNKNOWN;
      } catch {
        return UNKNOWN;
      }
    },
    purchase: () => {
      try {
        return bridge.purchase() === true;
      } catch {
        return false;
      }
    },
    restore: () => {
      try {
        bridge.restore();
      } catch {
        // The app is going away; the next launch asks Google Play again.
      }
    },
    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function isBridge(value: unknown): value is AndroidBillingBridge {
  if (typeof value !== "object" || value === null) return false;
  const { state, purchase, restore } = value as Record<string, unknown>;
  return typeof state === "function" && typeof purchase === "function" && typeof restore === "function";
}

function toState(value: unknown): AdsPurchaseState | null {
  if (typeof value !== "object" || value === null) return null;
  const { available, entitlement, price } = value as Record<string, unknown>;
  if (typeof available !== "boolean" || !ENTITLEMENTS.includes(entitlement as AdsEntitlement)) return null;
  return { available, entitlement: entitlement as AdsEntitlement, price: typeof price === "string" && price.trim() !== "" ? price : null };
}
