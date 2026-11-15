import type { AppUpdateState, Key } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderDock, renderRemoteApp, speakKey, type DesktopState } from "./app-fakes";
import { FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { goTo } from "./i18n-helpers";

const STREAM: Key = { slot: 0, action: { type: "obs.toggleStream" } };
const RECORD: Key = { slot: 1, action: { type: "obs.toggleRecord" } };
const MUTE: Key = { slot: 2, action: { type: "obs.toggleMute", inputName: "Mic" } };
const CAPTIONS: Key = { slot: 3, action: { type: "captions.toggle" } };
const UPDATE: AppUpdateState = { currentVersion: "1.2.0", mode: "auto", status: "up-to-date", autoCheck: true };

const deckState = (overrides: Partial<DesktopState> = {}) =>
  desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [STREAM, RECORD, MUTE], "deck")], ...overrides });

/** The newest link to the desktop. */
const socket = () => FakeSocket.instances.at(-1)!;
const reads = (requests: readonly RecordedRequest[], url: string) => requests.filter((request) => request.method === "GET" && request.url === url).length;
const executed = (requests: readonly RecordedRequest[]) => requests.filter((request) => request.url === "/api/actions/execute");

/** The link drops and comes back: the app opens a new socket by itself after its retry delay. */
async function reconnect() {
  const before = FakeSocket.instances.length;
  act(() => socket().close());
  await waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(before), { timeout: 3000 });
  act(() => socket().open());
}

describe("after the link to the computer comes back", () => {
  it("shows a stream that started while the phone was away, instead of a stale Off that would stop it", async () => {
    const state = deckState();
    const { user, requests } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    const stream = await screen.findByRole("button", { name: "Stream" });
    await waitFor(() => expect(stream).toHaveAttribute("aria-pressed", "false"));
    act(() => socket().open());

    // The phone sleeps; meanwhile the stream goes live and the microphone is muted. No event reaches it.
    act(() => socket().close());
    state.obs.state = { currentScene: "Main", mutedInputs: ["Mic"], streaming: true, recording: true };

    // While it is away, the toggles say they cannot be trusted, and pressing one does nothing.
    for (const name of ["Stream", "Record", /^Mic/]) {
      const key = screen.getByRole("button", { name });
      expect(key).toHaveAttribute("aria-disabled", "true");
      expect(key).toHaveAccessibleDescription("No connection to the computer.");
      expect(key).not.toHaveAttribute("aria-pressed");
    }
    fireEvent.click(stream);
    expect(executed(requests)).toEqual([]);

    const statusReads = reads(requests, "/api/obs/status");
    await waitFor(() => expect(FakeSocket.instances.length).toBe(2), { timeout: 3000 });
    act(() => socket().open());

    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /^Record/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Mic/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Stream/ })).not.toHaveAttribute("aria-disabled", "true");
    expect(reads(requests, "/api/obs/status")).toBeGreaterThan(statusReads);
  });

  it("reads OBS again when the link first opens, so a change between the first read and the link is not missed", async () => {
    const state = deckState();
    const { user } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "false"));

    state.obs.state = { ...state.obs.state, streaming: true };
    act(() => socket().open());
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("does not let a slow re-read undo an event that arrived after it was asked for", async () => {
    const state = deckState();
    const { user, emit } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "false"));

    // The re-read is on its way with "not streaming" when the event that says "streaming" arrives.
    act(() => {
      socket().open();
      emit({ type: "obs-state", state: { ...state.obs.state, streaming: true } });
    });
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));
    expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("loads the boards again", async () => {
    const state = deckState();
    const { requests } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hi" });
    act(() => socket().open());

    act(() => socket().close());
    state.boards = [boardOf("talk", "Talk", [speakKey(0, "Hi"), speakKey(1, "Added while away")]), state.boards[1]!];
    const boardReads = reads(requests, "/api/boards");
    await waitFor(() => expect(FakeSocket.instances.length).toBe(2), { timeout: 3000 });
    act(() => socket().open());

    expect(await screen.findByRole("button", { name: "Added while away" })).toBeInTheDocument();
    expect(reads(requests, "/api/boards")).toBeGreaterThan(boardReads);
  });

  it("loads the settings again: OBS control turned off while away shows on the keys", async () => {
    const state = deckState();
    const { user, requests } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "false"));
    act(() => socket().open());

    state.settings = { ...state.settings, obs: { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: false } };
    state.obs = { ...state.obs, enabled: false, status: "disconnected" };
    const settingsReads = reads(requests, "/api/settings");
    await reconnect();

    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAccessibleDescription("The OBS connection is turned off in Settings."));
    expect(reads(requests, "/api/settings")).toBeGreaterThan(settingsReads);
  });

  it("keeps phrases usable while the link is down: speaking does not wait for it", async () => {
    renderRemoteApp({ state: deckState() });
    const phrase = await screen.findByRole("button", { name: "Hi" });
    act(() => socket().open());
    act(() => socket().close());
    expect(phrase).not.toHaveAttribute("aria-disabled", "true");
  });

  it("loads the ads status and the sponsor again: ads removed while away go away", async () => {
    const state = deckState();
    const { user, requests } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    expect(await screen.findByRole("button", { name: "Remove ads" })).toBeInTheDocument();
    act(() => socket().open());

    state.adsGrants = [{ deviceId: "device-pixel-0001", deviceName: "Pixel 8" }];
    const adsReads = reads(requests, "/api/ads");
    const sponsorReads = reads(requests, "/api/ad");
    await reconnect();

    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove ads" })).not.toBeInTheDocument());
    expect(reads(requests, "/api/ads")).toBeGreaterThan(adsReads);
    await waitFor(() => expect(reads(requests, "/api/ad")).toBeGreaterThan(sponsorReads));
  });

  it("loads the computer app's update state again", async () => {
    const state = deckState({ appUpdate: UPDATE });
    const { user } = renderRemoteApp({ state, hostname: "127.0.0.1" });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Settings");
    const about = await screen.findByRole("group", { name: "About and updates" });
    expect(about).toHaveTextContent("You have the latest version.");
    act(() => socket().open());

    state.appUpdate = { ...UPDATE, status: "downloaded", latestVersion: "1.3.0" };
    await reconnect();

    await waitFor(() => expect(about).toHaveTextContent("Version 1.3.0 is downloaded."));
    expect(within(about).getByRole("button", { name: "Restart to update" })).toBeInTheDocument();
  });

  it("asks again whether an OBS overlay can play the voice", async () => {
    const state = deckState();
    state.settings = { ...state.settings, voiceOutput: "obs" };
    const { requests } = renderRemoteApp({ state, storedTarget: "computer" });
    await screen.findByRole("button", { name: "Hi" });
    await waitFor(() => expect(reads(requests, "/api/voice/status")).toBe(1));
    act(() => socket().open());
    await waitFor(() => expect(reads(requests, "/api/voice/status")).toBe(2));

    state.overlayConnected = true;
    await reconnect();
    await waitFor(() => expect(reads(requests, "/api/voice/status")).toBe(3));
  });

  it("refreshes the OBS dock the same way", async () => {
    const state = deckState();
    renderDock({ state, hostname: "127.0.0.1" });
    fireEvent.click(await screen.findByRole("button", { name: /Board: / }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Stream" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "false"));
    act(() => socket().open());

    act(() => socket().close());
    expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-disabled", "true");
    state.obs.state = { ...state.obs.state, streaming: true };
    await waitFor(() => expect(FakeSocket.instances.length).toBe(2), { timeout: 3000 });
    act(() => socket().open());
    await waitFor(() => expect(screen.getByRole("button", { name: /^Stream/ })).toHaveAttribute("aria-pressed", "true"));
  });
});
