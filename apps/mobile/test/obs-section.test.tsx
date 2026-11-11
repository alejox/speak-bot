import type { Key } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SECTION_STORAGE_KEY } from "../src/app/use-section";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const sceneKey: Key = { slot: 0, action: { type: "obs.switchScene", sceneName: "Main" } };
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [sceneKey], "deck")];
const menuItems = () => within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("link").map((link) => link.textContent);
const disconnected = () => {
  const state = desktopState({ boards: boards() });
  state.obs = { ...state.obs, status: "error" };
  return state;
};

describe("the OBS section belongs to the computer", () => {
  it("is in the menu of the computer's own window", async () => {
    renderRemoteApp({ state: desktopState({ boards: boards() }), hostname: "localhost" });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await waitFor(() => expect(menuItems()).toEqual(["Stream", "Voice", "OBS, connected", "Settings"]));
  });

  it("is not in the menu of a paired device", async () => {
    renderRemoteApp({ state: desktopState({ boards: boards() }) });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(menuItems()).toEqual(["Stream", "Voice", "Settings"]);
  });

  it("is not in the menu in phone-only mode", async () => {
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(menuItems()).toEqual(["Stream", "Voice", "Settings"]);
  });

  it("falls back to the Deck when the last section was OBS on a paired device, and opens OBS on the computer", async () => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify("obs"));
    const paired = renderRemoteApp({ state: desktopState({ boards: boards() }) });
    expect(await screen.findByRole("button", { name: "Board: Stream" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "OBS" })).not.toBeInTheDocument();
    paired.view.unmount();

    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify("obs"));
    renderRemoteApp({ state: desktopState({ boards: boards() }), hostname: "localhost" });
    expect(await screen.findByRole("heading", { level: 2, name: "OBS" })).toBeInTheDocument();
  });

  it("keeps the Deck status icon on a paired device, without leading anywhere", async () => {
    const { user } = renderRemoteApp({ state: disconnected() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    expect(await screen.findByRole("img", { name: "OBS not connected" })).toHaveClass("deck-indicator-off");
    expect(screen.queryByRole("button", { name: /Open OBS/ })).not.toBeInTheDocument();
  });

  it("still leads to the OBS section from the icon on the computer", async () => {
    const { user } = renderRemoteApp({ state: disconnected(), hostname: "localhost" });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    await user.click(await screen.findByRole("button", { name: "OBS not connected. Open OBS" }));
    expect(screen.getByRole("heading", { level: 2, name: "OBS" })).toBeInTheDocument();
  });
});
