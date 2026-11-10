import type { Key } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setWideScreen, speakKey } from "./app-fakes";
import { boardPill } from "./board-picker";

const nav = () => screen.getByRole("navigation", { name: "Sections" });
const menuItems = () => within(nav()).getAllByRole("link").map((link) => link.textContent);
const sceneKey = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const boards = () => [
  boardOf("talk", "Talk", [speakKey(0, "Hi")]),
  boardOf("chat", "Chat", [speakKey(0, "Yo")]),
  boardOf("stream", "Stream", [sceneKey(0, "Live")], "deck"),
  boardOf("games", "Games", [sceneKey(0, "Play")], "deck"),
];

afterEach(() => {
  // Back to jsdom's default: no matchMedia, so neither the inspector nor the tab bar layout.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("deck boards in the menu", () => {
  it("lists each deck board as its own menu item, before Voice, with no nested lists", async () => {
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(menuItems()).toEqual(["Stream", "Games", "Voice", "OBS, not connected", "Settings"]);
    expect(within(nav()).queryByRole("list", { name: /boards/ })).not.toBeInTheDocument();
  });

  it("opens the Deck on the chosen board and marks that item as the page on screen", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(within(nav()).getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav()).getByRole("link", { name: "Games" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(boardPill()).toHaveAccessibleName("Board: Games");
    expect(within(nav()).getByRole("link", { name: "Games" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Stream" })).not.toHaveAttribute("aria-current");
    expect(within(nav()).getByRole("link", { name: "Voice" })).not.toHaveAttribute("aria-current");

    // Switching boards with the pill moves the current item too.
    await user.click(boardPill());
    await user.click(screen.getByRole("menuitemradio", { name: "Stream" }));
    expect(await screen.findByRole("button", { name: "Live" })).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Stream" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Games" })).not.toHaveAttribute("aria-current");
  });

  it("shows a single Deck item that opens the empty Deck when there are no deck boards", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    expect(menuItems()).toEqual(["Deck", "Voice", "OBS, not connected", "Settings"]);
    await user.click(within(nav()).getByRole("link", { name: "Deck" }));
    expect(await screen.findByText("There are no boards here yet.")).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
  });

  it("adds a new deck board right after the other deck items and renames items with their board", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")]), boardOf("stream", "Stream", [sceneKey(0, "Live")], "deck")] });
    const { user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "A" });
    await user.click(within(nav()).getByRole("link", { name: "Stream" }));
    await screen.findByRole("button", { name: "Live" });

    await user.click(boardPill());
    await user.click(screen.getByRole("menuitem", { name: "New board" }));
    const name = within(screen.getByRole("dialog")).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Games{Enter}");
    await waitFor(() => expect(menuItems().slice(0, 3)).toEqual(["Stream", "Games", "Voice"]));

    await user.click(boardPill());
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const rename = within(screen.getByRole("dialog")).getByRole("textbox", { name: "Name" });
    await user.clear(rename);
    await user.type(rename, "Party{Enter}");
    await waitFor(() => expect(menuItems().slice(0, 3)).toEqual(["Stream", "Party", "Voice"]));
  });

  it("keeps each deck board in the collapsed rail as an icon named after the board", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(screen.getByRole("button", { name: "Collapse menu" }));
    const games = within(nav()).getByRole("link", { name: "Games" });
    expect(games).toHaveAttribute("title", "Games");
    expect(within(nav()).getByRole("link", { name: "Stream" })).toHaveAttribute("title", "Stream");
  });

  it("keeps a single Deck tab in the phone tab bar, where the board pill switches boards", async () => {
    setWideScreen(false);
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(menuItems()).toEqual(["Deck", "Voice", "OBS, not connected", "Settings"]);
    await user.click(within(nav()).getByRole("link", { name: "Deck" }));
    expect(await screen.findByRole("button", { name: "Live" })).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
  });

  it("returns to the last deck board when the Deck was open last", async () => {
    localStorage.setItem("speed-deck:board-position:deck", JSON.stringify({ boardId: "games", page: 0 }));
    renderLocalApp({ boards: boards(), section: "deck" });
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Games" })).toHaveAttribute("aria-current", "page");
  });
});
