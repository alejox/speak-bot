import type { Key } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { boardPill } from "./board-picker";

const nav = () => screen.getByRole("navigation", { name: "Sections" });
/** The boards listed under a section's menu item. */
const boardsUnder = (section: string) => {
  const item = within(nav()).getByRole("link", { name: section }).closest("li");
  const list = item && within(item).queryByRole("list", { name: `${section} boards` });
  return list ? within(list).getAllByRole("link").map((link) => link.textContent) : [];
};
const sceneKey = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const boards = () => [
  boardOf("talk", "Talk", [speakKey(0, "Hi")]),
  boardOf("chat", "Chat", [speakKey(0, "Yo")]),
  boardOf("stream", "Stream", [sceneKey(0, "Live")], "deck"),
];

describe("boards in the menu", () => {
  it("lists each space's boards under its menu item, by kind", async () => {
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(boardsUnder("Voice")).toEqual(["Talk, board", "Chat, board"]);
    expect(boardsUnder("Deck")).toEqual(["Stream, board"]);
  });

  it("opens a board from the menu in its section, marking it as current", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    const talk = within(nav()).getByRole("link", { name: "Talk, board" });
    expect(talk).toHaveAttribute("aria-current", "true");

    await user.click(within(nav()).getByRole("link", { name: "Chat, board" }));
    expect(await screen.findByRole("button", { name: "Yo" })).toBeInTheDocument();
    expect(boardPill()).toHaveAccessibleName("Board: Chat");
    expect(within(nav()).getByRole("link", { name: "Chat, board" })).toHaveAttribute("aria-current", "true");
    expect(talk).not.toHaveAttribute("aria-current");

    await user.click(within(nav()).getByRole("link", { name: "Stream, board" }));
    expect(await screen.findByRole("button", { name: "Live" })).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Stream, board" })).toHaveAttribute("aria-current", "true");
    // Only the board on screen is current.
    expect(within(nav()).getByRole("link", { name: "Chat, board" })).not.toHaveAttribute("aria-current");
  });

  it("shows a new board in the menu at once", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const { user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "A" });
    await user.click(boardPill());
    await user.click(screen.getByRole("menuitem", { name: "New board" }));
    const name = within(screen.getByRole("dialog")).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Games{Enter}");
    await waitFor(() => expect(boardsUnder("Voice")).toEqual(["Main, board", "Games, board"]));
  });

  it("hides the boards in the collapsed rail", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(boardsUnder("Voice")).toEqual([]);
    expect(within(nav()).queryByRole("link", { name: "Talk, board" })).not.toBeInTheDocument();
  });
});
