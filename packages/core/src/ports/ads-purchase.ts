/**
 * Whether the app store account on this device bought "remove ads":
 * - "unknown": the store has not answered yet on this device;
 * - "pending": bought with a payment that is not complete yet, so ads still show.
 */
export type AdsEntitlement = "unknown" | "not-owned" | "pending" | "owned";

export interface AdsPurchaseState {
  /** False when the store cannot sell "remove ads" right now (no store, no account, product not found). */
  readonly available: boolean;
  readonly entitlement: AdsEntitlement;
  /** The price as the store formats it for this person's country (e.g. "$4.99"), once known. */
  readonly price: string | null;
}

/**
 * The one-time "remove ads" purchase of the app store this app was installed from (Google Play in the
 * Android app). Absent where the app is not sold through a store.
 */
export interface AdsPurchase {
  getState(): AdsPurchaseState;
  /** Opens the store's purchase flow; false when it could not be started. The result arrives through `onChanged`. */
  purchase(): boolean;
  /** Asks the store again what this account owns ("restore purchase"). The result arrives through `onChanged`. */
  restore(): void;
  /** The state changed. Returns an unsubscribe function. */
  onChanged(listener: (state: AdsPurchaseState) => void): () => void;
}
