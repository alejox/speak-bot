import type { Key, ObsState } from "@speed-deck/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const deckKeys: Key[] = [
  { slot: 0, action: { type: "obs.toggleStream" } },
  { slot: 1, action: { type: "obs.toggleRecord" } },
  { slot: 2, action: { type: "obs.toggleMute", inputName: "Mic" } },
  { slot: 3, action: { type: "obs.switchScene", sceneName: "Main" } },
];
// Caption keys belong to Voice boards.
const captionsKey: Key = { slot: 1, action: { type: "captions.toggle" } };
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi"), captionsKey]), boardOf("stream", "Stream", deckKeys, "deck")];
const idle: ObsState = { currentScene: "BRB", mutedInputs: [], streaming: false, recording: false };
const statusPill = () => screen.getByRole("group", { name: "Deck status" });

async function openDeck(obsState = idle, status = "connected") {
  const state = desktopState({ boards: boards() });
  state.obs = { enabled: true, status, state: obsState };
  const remote = renderRemoteApp({ state });
  await screen.findByRole("button", { name: "Hi" });
  await goTo(remote.user, "Deck");
  await screen.findByRole("button", { name: /^Stream/ });
  return remote;
}

describe("Deck status", () => {
  it("says the computer is not connected, keeps the explanation and offers no link when nothing applies", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    expect(statusPill()).toHaveTextContent("Computer not connected");
    expect(screen.getByText(/control OBS through the Speed Deck computer app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Settings" })).not.toBeInTheDocument();
  });

  it("leads to Settings when the computer app is there but this device was chosen", async () => {
    const { user } = renderRemoteApp({ storedTarget: "device" });
    await screen.findByRole("button", { name: "Local phrase" });
    await goTo(user, "Deck");
    expect(statusPill()).toHaveTextContent("Computer not connected");
    await user.click(await screen.findByRole("button", { name: "Open Settings" }));
    expect(screen.getByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
  });

  it("is not shown in the Voice space", async () => {
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByRole("group", { name: "Deck status" })).not.toBeInTheDocument();
  });

  it("says when OBS is connected and when it is not", async () => {
    const { emit } = await openDeck();
    await waitFor(() => expect(statusPill()).toHaveTextContent("OBS connected"));
    act(() => emit({ type: "obs-status", status: "error", code: "connection-lost" }));
    expect(statusPill()).toHaveTextContent("OBS not connected");
    expect(statusPill()).not.toHaveTextContent("OBS connected");
  });

  it("adds streaming and recording while they are on", async () => {
    const { emit } = await openDeck();
    await waitFor(() => expect(statusPill()).toHaveTextContent("OBS connected"));
    expect(within(statusPill()).queryByText("Live")).not.toBeInTheDocument();
    act(() => emit({ type: "obs-state", state: { ...idle, streaming: true, recording: true } }));
    expect(within(statusPill()).getByText("Live")).toBeInTheDocument();
    expect(within(statusPill()).getByText("Recording")).toBeInTheDocument();
  });
});

describe("Deck keys live state", () => {
  it("shows no state cue while everything is off", async () => {
    await openDeck({ ...idle }, "connected");
    const stream = screen.getByRole("button", { name: "Stream" });
    await waitFor(() => expect(stream).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("button", { name: "Record" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Mic" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Main" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names live, recording and muted on the key, with aria-pressed", async () => {
    await openDeck({ currentScene: "Main", mutedInputs: ["Mic"], streaming: true, recording: true });
    const stream = await screen.findByRole("button", { name: "Stream LIVE" });
    expect(stream).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Record REC" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mic Muted" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Main" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows captions as on while they are visible, on the Voice board", async () => {
    const state = desktopState({ boards: boards() });
    const { emit } = renderRemoteApp({ state });
    const captions = await screen.findByRole("button", { name: "Captions On" });
    expect(captions).toHaveAttribute("aria-pressed", "true");
    act(() => emit({ type: "captions-visibility", visible: false }));
    expect(screen.getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the reason on a key that is offline", async () => {
    const { emit } = await openDeck();
    act(() => emit({ type: "obs-status", status: "error", code: "connection-lost" }));
    const stream = screen.getByRole("button", { name: "Stream" });
    expect(stream).toHaveAttribute("aria-disabled", "true");
    expect(stream).toHaveAccessibleDescription("OBS is not connected.");
  });
});
