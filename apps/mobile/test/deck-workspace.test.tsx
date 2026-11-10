import type { Key, ObsState } from "@speed-deck/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setWideScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const sceneKey = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [sceneKey(0, "Main")], "deck")];
const idle: ObsState = { currentScene: "BRB", mutedInputs: [], streaming: false, recording: false };
const explanation = /control OBS through the Speed Deck computer app/;

async function openLocalDeck() {
  const rendered = renderLocalApp({ boards: boards() });
  await screen.findByRole("button", { name: "Hi" });
  await goTo(rendered.user, "Deck");
  await screen.findByRole("button", { name: "Main" });
  return rendered;
}

describe("Deck workspace on wide screens", () => {
  beforeEach(() => setWideScreen(true));
  afterEach(() => setWideScreen(false));

  it("keeps the Deck heading and the status line for screen readers only", async () => {
    const { user } = await openLocalDeck();
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).toHaveClass("visually-hidden");
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start or stop stream" }));
    const status = screen.getAllByRole("status").find((element) => element.classList.contains("status"));
    await waitFor(() => expect(status).toHaveTextContent("Key saved."));
    expect(status).toHaveClass("visually-hidden");
  });

  it("shows the connection as one icon whose name says it all, without notes in the workspace", async () => {
    await openLocalDeck();
    expect(screen.queryByRole("group", { name: "Deck status" })).not.toBeInTheDocument();
    // The note only describes the indicator; no paragraph shows it in the workspace.
    expect(screen.getByText(explanation)).not.toBeVisible();
    const indicator = screen.getByRole("button", { name: "Computer not connected. Open Settings" });
    expect(indicator).toHaveAccessibleDescription(explanation);
    expect(indicator).toHaveAttribute("title", expect.stringMatching(explanation));
  });

  it("leads to Settings from the indicator when this device was chosen instead of the computer", async () => {
    const { user } = renderRemoteApp({ storedTarget: "device" });
    await screen.findByRole("button", { name: "Local phrase" });
    await goTo(user, "Deck");
    expect(screen.queryByRole("button", { name: "Open Settings" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Computer not connected. Open Settings" }));
    expect(screen.getByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
  });

  it("names OBS, live and recording on the indicator when the computer runs the keys", async () => {
    const state = desktopState({ boards: boards() });
    state.obs = { enabled: true, status: "connected", state: idle };
    const { user, emit } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    expect(await screen.findByRole("img", { name: "OBS connected" })).toHaveAttribute("title", "OBS connected");
    act(() => emit({ type: "obs-state", state: { ...idle, streaming: true, recording: true } }));
    expect(screen.getByRole("img", { name: "OBS connected, Live, Recording" })).toBeInTheDocument();
  });

  it("docks the key inspector beside the workspace, not inside it", async () => {
    await openLocalDeck();
    const panel = screen.getByRole("complementary", { name: "New key" });
    expect(screen.getByRole("main")).not.toContainElement(panel);
  });
});

describe("Deck workspace on narrow screens", () => {
  it("keeps the visible heading, status pills and notes", async () => {
    await openLocalDeck();
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).not.toHaveClass("visually-hidden");
    expect(screen.getByRole("group", { name: "Deck status" })).toBeInTheDocument();
    expect(screen.getByText(explanation)).toBeInTheDocument();
  });
});
