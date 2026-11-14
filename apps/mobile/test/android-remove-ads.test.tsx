import type { AdsPurchase, AdsPurchaseState, Key } from "@speed-deck/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findAndroidAdsPurchase } from "../src/adapters/android-ads-purchase";
import { DEVICE_ID_STORAGE_KEY, findDeviceIdentity } from "../src/adapters/device-identity";
import { App } from "../src/app/App";
import { boardOf, desktopState, localServices, remoteServices, speakKey, type LocalSetupOptions, type RemoteSetupOptions } from "./app-fakes";
import { FakeSocket } from "./desktop-fakes";
import { goTo } from "./i18n-helpers";

const deckKeys: Key[] = [{ slot: 0, action: { type: "obs.toggleStream" } }];
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", deckKeys, "deck")];
const banner = () => screen.queryByRole("region", { name: "Advertisement" });
const NOT_OWNED: AdsPurchaseState = { available: true, entitlement: "not-owned", price: "$4.99" };
const OWNED: AdsPurchaseState = { ...NOT_OWNED, entitlement: "owned" };
/** This phone as the Android app identifies it to the computer. */
const PIXEL = { id: "device-pixel-0001", name: "Pixel 8" };
const deviceIdentity = () => PIXEL;
/** Another phone whose purchase already removed the computer's ads. */
const GALAXY_GRANT = [{ deviceId: "device-galaxy-0002", deviceName: "Galaxy S24" }];

/** Google Play as the Android app exposes it to the web app; `emit` changes the state like the store would. */
function fakeStore(initial: AdsPurchaseState = NOT_OWNED) {
  let state = initial;
  const listeners = new Set<(state: AdsPurchaseState) => void>();
  const store: AdsPurchase = {
    getState: () => state,
    purchase: vi.fn(() => true),
    restore: vi.fn(),
    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const emit = (next: AdsPurchaseState) => {
    state = next;
    for (const listener of [...listeners]) listener(next);
  };
  return { store, emit };
}

/** The Android app showing its bundled web app: no computer. */
async function openAndroidAlone(initial?: AdsPurchaseState, options: LocalSetupOptions = {}) {
  const fake = fakeStore(initial);
  const { services } = localServices({ boards: boards(), ...options });
  const view = render(<App services={{ ...services, adsPurchase: fake.store, deviceIdentity }} />);
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Hi" });
  return { ...fake, user, view };
}

/** The Android app showing the web app served by a computer. */
async function openAndroidPaired(initial: AdsPurchaseState | undefined, options: RemoteSetupOptions) {
  const fake = fakeStore(initial);
  const remote = remoteServices({ hostname: "192.168.1.20", ...options });
  render(<App services={{ ...remote.services, adsPurchase: fake.store, deviceIdentity }} />);
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Hi" });
  /** What this phone told the computer about its purchase, oldest first. */
  const reports = () => remote.requests.filter((request) => request.method === "POST" && request.url === "/api/ads/report").map((request) => request.body);
  // `emit` is the computer's (server events); the store's own changes go through `emitStore`.
  return { ...fake, ...remote, emitStore: fake.emit, user, reports };
}

async function openSettingsGroup(user: Parameters<typeof goTo>[0]) {
  await goTo(user, "Settings");
  return screen.findByRole("group", { name: "Remove ads" });
}

/** Nothing that sells anything outside Google Play. */
function expectNoOutsidePurchase(group: HTMLElement) {
  expect(within(group).queryByRole("link")).not.toBeInTheDocument();
  expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
  expect(group).not.toHaveTextContent(/USD|licen[sc]e|\bkey\b/i);
}

describe("ad banner inside the Android app", () => {
  it("is hidden when Google Play says remove ads is owned, and follows changes", async () => {
    const { user, emit } = await openAndroidAlone({ available: true, entitlement: "owned", price: "$4.99" });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: /^Stream/ });
    expect(banner()).not.toBeInTheDocument();

    act(() => emit(NOT_OWNED));
    expect(await screen.findByRole("region", { name: "Advertisement" })).toBeInTheDocument();

    act(() => emit({ ...NOT_OWNED, entitlement: "owned" }));
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it("still shows while the payment is pending", async () => {
    const { user } = await openAndroidAlone({ available: true, entitlement: "pending", price: "$4.99" });
    await goTo(user, "Deck");
    expect(await screen.findByRole("region", { name: "Advertisement" })).toBeInTheDocument();
  });

  it("shows the house message with the store's price, never a fixed one, and opens Settings → Remove ads", async () => {
    const { user } = await openAndroidAlone();
    await goTo(user, "Deck");
    const ad = await screen.findByRole("region", { name: "Advertisement" });
    expect(ad).not.toHaveTextContent(/USD/);
    await user.click(within(ad).getByRole("button", { name: "Remove ads for $4.99" }));
    expect(screen.getByRole("heading", { name: "Remove ads" })).toHaveFocus();
  });

  it("shows the house message without a price while the store has not told it", async () => {
    const { user } = await openAndroidAlone({ available: false, entitlement: "unknown", price: null });
    await goTo(user, "Deck");
    const ad = await screen.findByRole("region", { name: "Advertisement" });
    expect(within(ad).getByRole("button", { name: "Remove ads" })).toBeInTheDocument();
  });

  it("is hidden while another phone's purchase removes the computer's ads, whatever Google Play says here", async () => {
    const state = desktopState({ boards: boards(), adsGrants: GALAXY_GRANT });
    const { user } = await openAndroidPaired(NOT_OWNED, { state });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: /^Stream/ });
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(banner()).not.toBeInTheDocument();
  });

  it("is hidden on a computer's deck when Google Play says remove ads is owned", async () => {
    const state = desktopState({ boards: boards() });
    const { user } = await openAndroidPaired({ ...NOT_OWNED, entitlement: "owned" }, { state });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: /^Stream/ });
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(banner()).not.toBeInTheDocument();
  });
});

describe("Settings → Remove ads inside the Android app", () => {
  it("offers the purchase with the store's price and starts it on Google Play", async () => {
    const { user, store } = await openAndroidAlone();
    const group = await openSettingsGroup(user);
    expect(group).toHaveTextContent("Ads are shown.");
    await user.click(within(group).getByRole("button", { name: "Remove ads for $4.99" }));
    expect(store.purchase).toHaveBeenCalledTimes(1);
    expectNoOutsidePurchase(group);
  });

  it("says so when the purchase could not be started", async () => {
    const { user, store } = await openAndroidAlone();
    vi.mocked(store.purchase).mockReturnValue(false);
    const group = await openSettingsGroup(user);
    await user.click(within(group).getByRole("button", { name: "Remove ads for $4.99" }));
    expect(await screen.findByText("Could not start the purchase. Try again in a moment.")).toHaveAttribute("role", "status");
  });

  it("restores a purchase by asking Google Play again", async () => {
    const { user, store, emit } = await openAndroidAlone();
    const group = await openSettingsGroup(user);
    await user.click(within(group).getByRole("button", { name: "Restore purchase" }));
    expect(store.restore).toHaveBeenCalledTimes(1);

    act(() => emit({ ...NOT_OWNED, entitlement: "owned" }));
    await waitFor(() => expect(group).toHaveTextContent("Ads are removed. Thank you!"));
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    expectNoOutsidePurchase(group);
  });

  it("explains a pending payment and does not sell it twice", async () => {
    const { user } = await openAndroidAlone({ available: true, entitlement: "pending", price: "$4.99" });
    const group = await openSettingsGroup(user);
    expect(group).toHaveTextContent("Your payment is pending. Ads go away as soon as Google Play confirms it.");
    expect(within(group).queryByRole("button", { name: /^Remove ads/ })).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Restore purchase" })).toBeInTheDocument();
  });

  it("says when Google Play purchases are not available, and can still look for a purchase", async () => {
    const { user, store } = await openAndroidAlone({ available: false, entitlement: "unknown", price: null });
    const group = await openSettingsGroup(user);
    expect(group).toHaveTextContent("Purchases are not available right now. Check that Google Play is signed in and connected, then try again.");
    expect(within(group).queryByRole("button", { name: /^Remove ads/ })).not.toBeInTheDocument();
    await user.click(within(group).getByRole("button", { name: "Restore purchase" }));
    expect(store.restore).toHaveBeenCalledTimes(1);
    expectNoOutsidePurchase(group);
  });

  it("offers the purchase without a price when the store has not told it", async () => {
    const { user } = await openAndroidAlone({ available: true, entitlement: "not-owned", price: null });
    const group = await openSettingsGroup(user);
    expect(within(group).getByRole("button", { name: "Remove ads" })).toBeInTheDocument();
  });

  it("offers only the Google Play purchase on a phone served by a computer", async () => {
    const state = desktopState({ boards: boards() });
    const { user } = await openAndroidPaired(NOT_OWNED, { state });
    const group = await openSettingsGroup(user);
    expect(within(group).getByRole("button", { name: "Remove ads for $4.99" })).toBeInTheDocument();
    expectNoOutsidePurchase(group);
  });

  it("says ads are hidden through the computer when another phone bought it, and still offers the purchase", async () => {
    const state = desktopState({ boards: boards(), adsGrants: GALAXY_GRANT });
    const { user, store } = await openAndroidPaired(NOT_OWNED, { state });
    const group = await openSettingsGroup(user);
    await waitFor(() => expect(group).toHaveTextContent("Ads are hidden while this phone is connected to your computer."));
    await user.click(within(group).getByRole("button", { name: "Remove ads for $4.99" }));
    expect(store.purchase).toHaveBeenCalledTimes(1);
    expectNoOutsidePurchase(group);
  });

  it("says ads are also removed on the computer when this phone owns the purchase and is connected to it", async () => {
    const state = desktopState({ boards: boards() });
    const { user } = await openAndroidPaired(OWNED, { state });
    const group = await openSettingsGroup(user);
    expect(group).toHaveTextContent("Ads are removed. Thank you!");
    expect(group).toHaveTextContent("They are also removed on the computer this phone is connected to.");
    expectNoOutsidePurchase(group);
  });

  it("does not mention a computer when this phone owns the purchase and uses no computer", async () => {
    const { user } = await openAndroidAlone(OWNED);
    const group = await openSettingsGroup(user);
    expect(group).toHaveTextContent("Ads are removed. Thank you!");
    expect(group).not.toHaveTextContent(/computer/i);
  });

  it("is in Spanish with the Spanish interface", async () => {
    const { user } = await openAndroidAlone(NOT_OWNED, { language: "es" });
    await user.click(screen.getByRole("link", { name: "Ajustes" }));
    const group = await screen.findByRole("group", { name: "Quitar anuncios" });
    expect(within(group).getByRole("button", { name: "Quitar anuncios por $4.99" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Restaurar compra" })).toBeInTheDocument();
  });
});

describe("telling the computer about the Google Play purchase", () => {
  const state = () => desktopState({ boards: boards() });

  it("reports the purchase with this phone's id and name, which removes the computer's ads", async () => {
    const paired = await openAndroidPaired(OWNED, { state: state() });
    await waitFor(() => expect(paired.reports()).toContainEqual({ deviceId: "device-pixel-0001", deviceName: "Pixel 8", entitlement: "owned" }));
    expect(paired.state.adsGrants).toEqual([{ deviceId: "device-pixel-0001", deviceName: "Pixel 8" }]);
  });

  it("reports again when the purchase changes: bought while connected, then refunded", async () => {
    const paired = await openAndroidPaired(NOT_OWNED, { state: state() });
    await waitFor(() => expect(paired.reports()).toEqual([{ deviceId: "device-pixel-0001", deviceName: "Pixel 8", entitlement: "not-owned" }]));

    act(() => paired.emitStore({ ...NOT_OWNED, entitlement: "pending" }));
    act(() => paired.emitStore(OWNED));
    await waitFor(() => expect(paired.reports().at(-1)).toMatchObject({ entitlement: "owned" }));
    await waitFor(() => expect(paired.state.adsGrants).toHaveLength(1));

    act(() => paired.emitStore(NOT_OWNED));
    await waitFor(() => expect(paired.reports().at(-1)).toMatchObject({ entitlement: "not-owned" }));
    await waitFor(() => expect(paired.state.adsGrants).toEqual([]));
    // The pending payment in between was never sent as a fact.
    expect(paired.reports().map((report) => (report as { entitlement: string }).entitlement)).toEqual(["not-owned", "owned", "not-owned"]);
  });

  it("reports again each time the link to the computer opens", async () => {
    const paired = await openAndroidPaired(OWNED, { state: state() });
    await waitFor(() => expect(paired.reports()).toHaveLength(1));
    act(() => FakeSocket.instances.at(-1)!.open());
    await waitFor(() => expect(paired.reports()).toHaveLength(2));
    expect(paired.reports()[1]).toEqual({ deviceId: "device-pixel-0001", deviceName: "Pixel 8", entitlement: "owned" });
  });

  it("does not report while Google Play has not answered or the payment is pending", async () => {
    const paired = await openAndroidPaired({ available: false, entitlement: "unknown", price: null }, { state: state() });
    act(() => paired.emitStore({ ...NOT_OWNED, entitlement: "pending" }));
    await waitFor(() => expect(paired.requests.some((request) => request.url === "/api/ads")).toBe(true));
    expect(paired.reports()).toEqual([]);
  });

  it("does not report from the app's own bundled pages, where no computer answers", async () => {
    const fake = fakeStore(OWNED);
    const remote = remoteServices({ noDesktop: true });
    render(<App services={{ ...remote.services, adsPurchase: fake.store, deviceIdentity }} />);
    await screen.findByRole("button", { name: "Local phrase" });
    act(() => fake.emit(NOT_OWNED));
    act(() => fake.emit(OWNED));
    expect(remote.requests.filter((request) => request.url.startsWith("/api/ads"))).toEqual([]);
  });

  it("does not report from a browser, which has no store purchase", async () => {
    const remote = remoteServices({ state: state() });
    render(<App services={{ ...remote.services, deviceIdentity }} />);
    await screen.findByRole("button", { name: "Hi" });
    await waitFor(() => expect(remote.requests.some((request) => request.url === "/api/ads")).toBe(true));
    expect(remote.requests.filter((request) => request.url === "/api/ads/report")).toEqual([]);
  });

  it("does not report when the phone cannot be identified", async () => {
    const fake = fakeStore(OWNED);
    const remote = remoteServices({ state: state() });
    render(<App services={{ ...remote.services, adsPurchase: fake.store, deviceIdentity: () => null }} />);
    await screen.findByRole("button", { name: "Hi" });
    await waitFor(() => expect(remote.requests.some((request) => request.url === "/api/ads")).toBe(true));
    expect(remote.requests.filter((request) => request.url === "/api/ads/report")).toEqual([]);
  });
});

describe("identifying this phone to the computer", () => {
  const storage = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values } as unknown as Storage & { values: Map<string, string> };
  };

  it("uses the id and the name the Android app gives", () => {
    const host = { SpeedDeckAndroidDevice: { deviceId: () => "0f8fad5b-d9cb-469f-a165-70867728950e", deviceName: () => " Samsung SM-S921B " } };
    const saved = storage();
    expect(findDeviceIdentity(host, saved)).toEqual({ id: "0f8fad5b-d9cb-469f-a165-70867728950e", name: "Samsung SM-S921B" });
    expect(saved.values.size).toBe(0);
  });

  it("makes an id once and keeps it in this page's storage when the app gives none", () => {
    const saved = storage();
    const olderApp = { SpeedDeckAndroidDevice: { vibrate: () => true, computerName: () => "" } };
    const first = findDeviceIdentity(olderApp, saved, () => "generated-id-0001");
    expect(first).toEqual({ id: "generated-id-0001", name: "Android" });
    expect(saved.values.get(DEVICE_ID_STORAGE_KEY)).toBe(JSON.stringify("generated-id-0001"));
    expect(findDeviceIdentity(olderApp, saved, () => "generated-id-0002")).toEqual(first);
  });

  it("ignores an id or a name the computer would refuse", () => {
    const saved = storage();
    const host = { SpeedDeckAndroidDevice: { deviceId: () => "bad id!", deviceName: () => "x".repeat(200) } };
    const identity = findDeviceIdentity(host, saved, () => "generated-id-0001");
    expect(identity).toEqual({ id: "generated-id-0001", name: "x".repeat(80) });

    const throwing = { SpeedDeckAndroidDevice: { deviceId: () => { throw new Error("gone"); }, deviceName: () => { throw new Error("gone"); } } };
    expect(findDeviceIdentity(throwing, saved, () => "unused")).toEqual({ id: "generated-id-0001", name: "Android" });
  });

  it("gives no identity when no id can be kept", () => {
    expect(findDeviceIdentity({}, null, () => "generated-id-0001")).toBeNull();
  });
});

describe("the Android billing bridge", () => {
  const bridgeHost = (state: string) => {
    const bridge = { state: vi.fn(() => state), purchase: vi.fn(() => true), restore: vi.fn() };
    const host: Record<string, unknown> = { SpeedDeckAndroidBilling: bridge };
    return { bridge, host, emit: (event: unknown) => (host.__speedDeckAndroidBillingEvent as (event: unknown) => void)(event) };
  };

  it("is absent outside the Android app", () => {
    expect(findAndroidAdsPurchase({})).toBeUndefined();
    expect(findAndroidAdsPurchase({ SpeedDeckAndroidBilling: { state: () => "{}" } })).toBeUndefined();
  });

  it("reads the state, with no price while it is empty", () => {
    const { host, bridge } = bridgeHost('{"available":true,"entitlement":"not-owned","price":"US$4.99"}');
    expect(findAndroidAdsPurchase(host)?.getState()).toEqual({ available: true, entitlement: "not-owned", price: "US$4.99" });
    bridge.state.mockReturnValue('{"available":false,"entitlement":"owned","price":""}');
    expect(findAndroidAdsPurchase(host)?.getState()).toEqual({ available: false, entitlement: "owned", price: null });
  });

  it("treats an unreadable state as unknown and unavailable", () => {
    for (const broken of ["nonsense", '{"available":"yes","entitlement":"gold"}', "null"]) {
      expect(findAndroidAdsPurchase(bridgeHost(broken).host)?.getState()).toEqual({ available: false, entitlement: "unknown", price: null });
    }
    const throwing = bridgeHost("{}");
    throwing.bridge.state.mockImplementation(() => {
      throw new Error("gone");
    });
    expect(findAndroidAdsPurchase(throwing.host)?.getState()).toEqual({ available: false, entitlement: "unknown", price: null });
  });

  it("starts the purchase and the restore on the bridge, and never throws", () => {
    const { host, bridge } = bridgeHost("{}");
    const store = findAndroidAdsPurchase(host)!;
    expect(store.purchase()).toBe(true);
    store.restore();
    expect(bridge.purchase).toHaveBeenCalledTimes(1);
    expect(bridge.restore).toHaveBeenCalledTimes(1);

    bridge.purchase.mockImplementation(() => {
      throw new Error("gone");
    });
    bridge.restore.mockImplementation(() => {
      throw new Error("gone");
    });
    expect(store.purchase()).toBe(false);
    expect(() => store.restore()).not.toThrow();
  });

  it("notifies listeners of the states the app sends, until they unsubscribe", () => {
    const { host, emit } = bridgeHost("{}");
    const store = findAndroidAdsPurchase(host)!;
    const listener = vi.fn();
    const stop = store.onChanged(listener);
    emit({ available: true, entitlement: "pending", price: "$4.99" });
    expect(listener).toHaveBeenLastCalledWith({ available: true, entitlement: "pending", price: "$4.99" });
    emit("garbage");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    emit({ available: true, entitlement: "owned", price: "" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
