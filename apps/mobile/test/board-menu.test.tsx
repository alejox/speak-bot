import { makeBoard, MAX_BOARD_PAGES, type Board, type Key } from "@speed-deck/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey, writes } from "./app-fakes";
import { boardPill, chooseBoard, findBoardPill } from "./board-picker";
import { goTo } from "./i18n-helpers";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const deckBoard = () => boardOf("stream", "Stream", [], "deck");

/** Opens the board menu and picks `item`; returns the dialog it opens. */
async function boardAction(user: { click: (element: Element) => Promise<void> }, item: string) {
  await user.click(await findBoardPill());
  await user.click(within(screen.getByRole("menu", { name: "Boards" })).getByRole("menuitem", { name: item }));
  return screen.getByRole("dialog");
}

describe("editing in the player, without a board editor", () => {
  it("has no edit toggle and no board editor screen", async () => {
    renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    expect(screen.queryByRole("button", { name: /^(Edit|Edit board|Done)$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Board editor" })).not.toBeInTheDocument();
  });

  it("offers only the actions the board's kind allows when adding a key", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: [boardOf("talk", "Talk"), deckBoard()] }) });
    await goTo(user, "Deck");
    await user.click(await screen.findByRole("button", { name: "Add a key at position 1" }));
    const dialog = screen.getByRole("dialog", { name: "Add key 1" });
    expect(within(dialog).getAllByRole("region").map((group) => group.getAttribute("aria-label"))).toEqual(["Navigation", "OBS"]);
    expect(within(dialog).queryByRole("button", { name: "Speak text" })).not.toBeInTheDocument();
    // Captions belong to Voice.
    expect(within(dialog).queryByRole("button", { name: "Clear caption" })).not.toBeInTheDocument();
  });

  it("keeps a caption key a deck board still holds working, and edits it offering only deck actions", async () => {
    // Stored by an earlier version and left there because no Voice board had room for it.
    const captions: Key = { slot: 0, action: { type: "captions.clear" } };
    const stream: Board = { ...boardOf("stream", "Stream", [], "deck"), keys: [captions] };
    const state = desktopState({ boards: [boardOf("talk", "Talk"), stream] });
    const { requests, user } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    const key = await within(grid()).findByRole("button", { name: "Clear caption" });
    await user.click(key);
    await waitFor(() => expect(requests).toContainEqual({ method: "POST", url: "/api/actions/execute", body: { action: { type: "captions.clear" } } }));

    fireEvent.contextMenu(key);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit key 1" });
    const action = within(dialog).getByRole("combobox", { name: "Action" });
    // The select shows the key's own action, but offers no caption category.
    expect(action).toHaveDisplayValue("Clear caption");
    expect(within(action).queryByRole("option", { name: "Hide or show captions" })).not.toBeInTheDocument();
    expect(within(action).getAllByRole("group").map((group) => group.getAttribute("label"))).toEqual(["Navigation", "OBS"]);
  });

  it("adds an OBS key with its scene, or a typed one when OBS is not connected", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [], "deck")] });
    const { requests, user } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    await user.click(await screen.findByRole("button", { name: "Add a key at position 1" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Switch scene" }));
    const scene = await within(dialog).findByRole("combobox", { name: "Scene" });
    await within(dialog).findByRole("option", { name: "BRB" });
    await user.selectOptions(scene, "BRB");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "BRB" })).toBeInTheDocument());
    expect(requests).toContainEqual({
      method: "PUT",
      url: "/api/boards/main/keys/0",
      body: { label: "", icon: "", color: "", activeColor: "", action: { type: "obs.switchScene", sceneName: "BRB" } },
    });
  });

  it("falls back to typing OBS names when OBS is not connected", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: [boardOf("main", "Main", [], "deck")], scenes: null }) });
    await goTo(user, "Deck");
    await user.click(await screen.findByRole("button", { name: "Add a key at position 1" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Switch scene" }));
    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Scene" })).toHaveAccessibleDescription("OBS is not connected: type the exact name.");
  });

  it("opens a new page past the last one from the pager, and keeps it once a key is added there", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] }) });
    await screen.findByRole("button", { name: "A" });
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await user.click(within(grid()).getByRole("button", { name: "Add a key at position 16" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Stop voice" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Stop voice" })).toBeInTheDocument());
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
  });

  it("never opens a page past the board limit", async () => {
    const keys = Array.from({ length: MAX_BOARD_PAGES }, (_, page) => speakKey(page * 15, `P${page + 1}`));
    const { user } = renderRemoteApp({ state: desktopState({ boards: [boardOf("main", "Main", keys)] }) });
    await screen.findByRole("button", { name: "P1" });
    for (let page = 1; page < MAX_BOARD_PAGES; page += 1) await user.click(screen.getAllByRole("button", { name: "Next page" }).at(-1)!);
    expect(screen.getByText(`Page ${MAX_BOARD_PAGES} of ${MAX_BOARD_PAGES}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Next page" }).at(-1)).toBeDisabled();
  });
});

describe("board menu", () => {
  it("creates a board with its name and switches to it", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const { requests, user } = renderRemoteApp({ state });
    const dialog = await boardAction(user, "New board");
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveFocus();
    expect(name).toHaveValue("Board 2");
    await user.clear(name);
    await user.type(name, "Games{Enter}");
    await waitFor(() => expect(boardPill()).toHaveAccessibleName("Board: Games"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes(requests)).toEqual(["POST /api/boards"]);
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards", body: { name: "Games", kind: "voice" } });
  });

  it("renames the current board", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const { requests, user } = renderRemoteApp({ state });
    const dialog = await boardAction(user, "Rename");
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Home");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(boardPill()).toHaveAccessibleName("Board: Home"));
    expect(writes(requests)).toEqual(["PATCH /api/boards/main"]);
  });

  it("deletes the current board after confirming, and never the only one", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")]), boardOf("games", "Games")] });
    const { user } = renderRemoteApp({ state });
    const dialog = await boardAction(user, "Delete");
    expect(within(dialog).getByText("Delete the board “Main” and all its keys? This cannot be undone.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "No, keep it" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(boardPill()).toHaveAccessibleName("Board: Games"));
    expect(screen.getByRole("status")).toHaveTextContent("Deleted “Main”.");

    await user.click(boardPill());
    const only = screen.getByRole("menuitem", { name: "Delete" });
    expect(only).toHaveAttribute("aria-disabled", "true");
    expect(only).toHaveAccessibleDescription("The only board cannot be deleted.");
    await user.click(only);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores the Communication board after confirming", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main")] });
    const { requests, user } = renderRemoteApp({ state });
    let dialog = await boardAction(user, "Restore default board");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(writes(requests)).toEqual([]);
    dialog = await boardAction(user, "Restore default board");
    await user.click(within(dialog).getByRole("button", { name: "Yes, restore" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Hello" })).toBeInTheDocument());
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/restore-default", body: { language: "en" } });
  });

  it("creates deck boards and restores the built-in deck board from the Deck space", async () => {
    const state = desktopState({ boards: [boardOf("talk", "Talk"), deckBoard()] });
    const { requests, user } = renderRemoteApp({ state });
    await goTo(user, "Deck");
    let dialog = await boardAction(user, "New board");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(requests).toContainEqual({ method: "POST", url: "/api/boards", body: { name: "Board 3", kind: "deck" } }));

    dialog = await boardAction(user, "Restore default board");
    expect(within(dialog).getByText("Restore the built-in “Deck” board? Its current keys will be replaced.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Yes, restore" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Stream" })).toBeInTheDocument());
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/restore-default", body: { language: "en", boardId: "deck" } });
  });

  it("shows desktop errors in the dialog's live region and keeps it open", async () => {
    const state = desktopState({ boards: Array.from({ length: 2 }, (_, index) => makeBoard(`b${index}`, `Board ${index}`, "voice")) });
    const { user } = renderRemoteApp({ state });
    await findBoardPill();
    await chooseBoard(user, "Board 1");
    // The desktop refuses because another device deleted this board meanwhile.
    state.boards = [state.boards[0]!];
    const dialog = await boardAction(user, "Delete");
    await user.click(within(dialog).getByRole("button", { name: "Yes, delete" }));
    expect(await within(dialog).findByText("That board no longer exists.")).toBeInTheDocument();
  });

  it("closes with Escape and returns focus to its button", async () => {
    const { user } = renderLocalApp();
    const button = await findBoardPill();
    await user.click(button);
    expect(within(screen.getByRole("menu")).getByRole("menuitemradio", { checked: true })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
