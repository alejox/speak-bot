import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeviceSignals, type DeviceSignals } from "../src/adapters/device-signals";
import { LocalStorageConnectionAlertsStore } from "../src/adapters/local-storage-connection-alerts-store";
import { App } from "../src/app/App";
import { CONNECTION_LOST_AFTER_MS, CONNECTION_RESTORED_FOR_MS, VIBRATION_PATTERNS } from "../src/app/connection-signal";
import { boardOf, desktopState, remoteServices, speakKey } from "./app-fakes";
import { FakeSocket } from "./desktop-fakes";
import { goTo } from "./i18n-helpers";

/** A device that records its vibrations and knows (or not) the computer's name. */
function fakeDevice(computerName: string | null = null): DeviceSignals & { vibrations: number[][] } {
  const vibrations: number[][] = [];
  return { vibrations, vibrate: (pattern) => void vibrations.push([...pattern]), computerName: () => computerName };
}

async function openApp({ computerName = null as string | null, language = "en" as const } = {}) {
  const remote = remoteServices({ state: desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] }), language });
  const device = fakeDevice(computerName);
  render(<App services={{ ...remote.services, device }} />);
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  return { ...remote, device, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) };
}

/** The newest link to the desktop. */
const socket = () => FakeSocket.instances.at(-1)!;
const elapse = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const lostBanner = () => screen.queryByRole("alert", { name: /Disconnected from/ }) ?? screen.queryByText(/Disconnected from/);

describe("telling the person that the phone lost the computer", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("says nothing while the first connection is being made", async () => {
    const { device } = await openApp();
    act(() => socket().close());
    elapse(CONNECTION_LOST_AFTER_MS * 5);
    expect(lostBanner()).toBeNull();
    expect(device.vibrations).toEqual([]);
  });

  it("vibrates and shows a banner after a loss that lasts, then announces the return for a moment", async () => {
    const { device } = await openApp({ computerName: "Studio Mac" });
    act(() => socket().open());
    act(() => socket().close());
    elapse(CONNECTION_LOST_AFTER_MS - 1);
    expect(lostBanner()).toBeNull();
    elapse(1);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Disconnected from Studio Mac — reconnecting…");
    expect(device.vibrations).toEqual([VIBRATION_PATTERNS.lost]);

    // Reconnecting attempts keep failing: no new vibration, the banner stays.
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_000)));
    act(() => socket().close());
    elapse(CONNECTION_LOST_AFTER_MS * 3);
    expect(device.vibrations).toEqual([VIBRATION_PATTERNS.lost]);

    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    act(() => socket().open());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(screen.getByTestId("connection-banner")).getByText("Connected again")).toBeInTheDocument();
    expect(device.vibrations).toEqual([VIBRATION_PATTERNS.lost, VIBRATION_PATTERNS.restored]);
    expect(VIBRATION_PATTERNS.restored).not.toEqual(VIBRATION_PATTERNS.lost);

    elapse(CONNECTION_RESTORED_FOR_MS);
    expect(screen.queryByTestId("connection-banner")).toBeNull();
  });

  it("names the computer generically when its name is not known, and ignores a short flap", async () => {
    const { device } = await openApp();
    act(() => socket().open());
    act(() => socket().close());
    elapse(CONNECTION_LOST_AFTER_MS / 2);
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    act(() => socket().open());
    elapse(CONNECTION_LOST_AFTER_MS * 2);
    expect(lostBanner()).toBeNull();
    expect(device.vibrations).toEqual([]);

    act(() => socket().close());
    elapse(CONNECTION_LOST_AFTER_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("Disconnected from your computer — reconnecting…");
  });

  it("keeps the banner but stays still when vibration is turned off in Settings, and remembers that", async () => {
    const { device, user } = await openApp();
    await goTo(user, "Settings");
    const toggle = screen.getByRole("checkbox", { name: "Vibrate on disconnect" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(new LocalStorageConnectionAlertsStore(localStorage).load()).toEqual({ vibrate: false });

    act(() => socket().open());
    act(() => socket().close());
    elapse(CONNECTION_LOST_AFTER_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("Disconnected from your computer — reconnecting…");
    expect(device.vibrations).toEqual([]);
  });
});

describe("the device signals", () => {
  it("vibrate through the Android app's bridge, which also knows the computer's name", () => {
    const calls: string[] = [];
    const host = { SpeedDeckAndroidDevice: { vibrate: (pattern: string) => (calls.push(pattern), true), computerName: () => "Studio Mac" }, navigator: { vibrate: vi.fn() } };
    const signals = createDeviceSignals(host);
    signals.vibrate([180, 90, 180]);
    expect(calls).toEqual(["180,90,180"]);
    expect(host.navigator.vibrate).not.toHaveBeenCalled();
    expect(signals.computerName()).toBe("Studio Mac");
  });

  it("fall back to the browser's vibration, without a computer name", () => {
    const host = { navigator: { vibrate: vi.fn(() => true) } };
    const signals = createDeviceSignals(host);
    signals.vibrate([60, 60, 60]);
    expect(host.navigator.vibrate).toHaveBeenCalledWith([60, 60, 60]);
    expect(signals.computerName()).toBeNull();
  });

  it("do nothing where nothing can vibrate, and treat a blank name as unknown", () => {
    expect(() => createDeviceSignals({}).vibrate([100])).not.toThrow();
    const blank = createDeviceSignals({ SpeedDeckAndroidDevice: { vibrate: () => true, computerName: () => "  " } });
    expect(blank.computerName()).toBeNull();
  });
});

describe("the vibration setting", () => {
  it("is on until turned off on this device", () => {
    const store = new LocalStorageConnectionAlertsStore(localStorage);
    expect(store.load()).toEqual({ vibrate: true });
    store.save({ vibrate: false });
    expect(store.load()).toEqual({ vibrate: false });
    localStorage.setItem("speed-deck:connection-alerts", "nonsense");
    expect(store.load()).toEqual({ vibrate: true });
    localStorage.clear();
  });
});
