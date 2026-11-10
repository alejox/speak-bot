import type { Key } from "@speed-deck/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const sceneKey = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const openBoardKey = (slot: number, boardId: string): Key => ({ slot, action: { type: "nav.goToBoard", boardId } });
const boardSelector = () => screen.getByRole("combobox", { name: "Board" });
const offeredBoards = () => within(boardSelector()).getAllByRole("option").map((option) => option.textContent);
const storedPosition = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null") as unknown;

const mixedBoards = () => [
  boardOf("talk", "Talk", [speakKey(0, "Hi"), speakKey(15, "Talk page two")]),
  boardOf("stream", "Stream", [sceneKey(0, "Main")], "deck"),
  boardOf("family", "Family", [speakKey(0, "Mum")]),
  boardOf("games", "Games", [sceneKey(0, "BRB"), sceneKey(15, "Outro")], "deck"),
];

describe("Voice and Deck spaces", () => {
  it("list only the boards of their own kind", async () => {
    const { user } = renderLocalApp({ boards: mixedBoards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(offeredBoards()).toEqual(["Talk", "Family"]);
    expect(screen.queryByRole("button", { name: "Main" })).not.toBeInTheDocument();

    await goTo(user, "Deck");
    expect(offeredBoards()).toEqual(["Stream", "Games"]);
    expect(screen.getByRole("button", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hi" })).not.toBeInTheDocument();
  });

  it("name the section after the space and the selector after what it picks", async () => {
    const { user } = renderLocalApp({ boards: mixedBoards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toBeInTheDocument();
    expect(boardSelector()).toHaveDisplayValue("Talk");
    await goTo(user, "Deck");
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).toBeInTheDocument();
    expect(boardSelector()).toHaveDisplayValue("Stream");
    expect(screen.queryByRole("combobox", { name: "Deck" })).not.toBeInTheDocument();
  });

  it("each remember their own board and page", async () => {
    const { user, view } = renderLocalApp({ boards: mixedBoards() });
    await screen.findByRole("button", { name: "Hi" });
    await user.selectOptions(boardSelector(), "Family");
    await goTo(user, "Deck");
    await user.selectOptions(boardSelector(), "Games");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: "Outro" })).toBeInTheDocument();

    await goTo(user, "Voice");
    expect(boardSelector()).toHaveDisplayValue("Family");
    expect(storedPosition("speed-deck:board-position:voice")).toEqual({ boardId: "family", page: 0 });
    expect(storedPosition("speed-deck:board-position:deck")).toEqual({ boardId: "games", page: 1 });

    view.unmount();
    const again = renderLocalApp();
    expect(await screen.findByRole("button", { name: "Mum" })).toBeInTheDocument();
    await goTo(again.user, "Deck");
    expect(screen.getByRole("button", { name: "Outro" })).toBeInTheDocument();
  });

  it("give the position stored before spaces to Voice when its board is a voice board", async () => {
    localStorage.setItem("speed-deck:board-position", JSON.stringify({ boardId: "talk", page: 1 }));
    const { user } = renderLocalApp({ boards: [boardOf("family", "Family"), ...mixedBoards()] });
    expect(await screen.findByRole("button", { name: "Talk page two" })).toBeInTheDocument();
    await goTo(user, "Deck");
    expect(boardSelector()).toHaveDisplayValue("Stream");
  });

  it("give the position stored before spaces to Deck when its board is a deck board", async () => {
    localStorage.setItem("speed-deck:board-position", JSON.stringify({ boardId: "games", page: 1 }));
    const { user } = renderLocalApp({ boards: mixedBoards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(boardSelector()).toHaveDisplayValue("Talk");
    await goTo(user, "Deck");
    expect(boardSelector()).toHaveDisplayValue("Games");
    expect(screen.getByRole("button", { name: "Outro" })).toBeInTheDocument();
  });

  it("switch space when a key opens a board of the other kind", async () => {
    const boards = [boardOf("talk", "Talk", [speakKey(0, "Hi"), openBoardKey(1, "games")]), boardOf("stream", "Stream", [], "deck"), boardOf("games", "Games", [sceneKey(0, "BRB"), openBoardKey(1, "talk")], "deck")];
    const { user } = renderLocalApp({ boards });
    await user.click(await screen.findByRole("button", { name: "Games" }));
    expect(screen.getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).toHaveFocus();
    expect(boardSelector()).toHaveDisplayValue("Games");
    expect(screen.getByRole("button", { name: "BRB" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Talk" }));
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Hi" })).toBeInTheDocument();
  });

  it("offer only boards of the same kind as targets of an “Open board” key", async () => {
    const { user } = renderLocalApp({ boards: mixedBoards() });
    await screen.findByRole("button", { name: "Hi" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Hi" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Action" }), "Open board");
    const targets = () => within(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Board" })).getAllByRole("option").map((option) => option.textContent);
    expect(targets()).toEqual(["Choose…", "Talk", "Family"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await goTo(user, "Deck");
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Main" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.selectOptions(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Action" }), "Open board");
    expect(targets()).toEqual(["Choose…", "Stream", "Games"]);
  });

  it("keep the saved target of an old key that opens a board of the other kind, by name", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [openBoardKey(0, "stream")]), boardOf("stream", "Stream", [], "deck")] });
    await screen.findByRole("button", { name: "Stream" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Stream" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const target = within(screen.getByRole("dialog")).getByRole("combobox", { name: "Board" });
    expect(target).toHaveDisplayValue("Stream");
    expect(within(target).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose…", "Talk", "Stream"]);
  });

  it("say when a space has no boards and create one of its kind", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    expect(screen.getByText("There are no boards here yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New board" }));
    await waitFor(() => expect(boardSelector()).toHaveDisplayValue("Board 2"));
    await goTo(user, "Voice");
    expect(offeredBoards()).toEqual(["Talk"]);
  });
});

describe("Deck space without the computer app", () => {
  const explanation = /control OBS through the Speed Deck computer app/;

  it("explains above the keys that the deck needs the computer app, keeping each key unavailable", async () => {
    const { user } = renderLocalApp({ boards: mixedBoards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
    await goTo(user, "Deck");
    const note = screen.getByText(explanation);
    const key = screen.getByRole("button", { name: "Main" });
    expect(note.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(key).toHaveAttribute("aria-disabled", "true");
    expect(key).toHaveAccessibleDescription("Needs the computer app.");
  });

  it("says nothing when the computer app runs the keys", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: mixedBoards() }) });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    expect(await screen.findByRole("button", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
  });

  it("points to the “Speak on” setting when the computer app is there but this device was chosen", async () => {
    const { user } = renderRemoteApp({ storedTarget: "device" });
    await screen.findByRole("button", { name: "Local phrase" });
    await goTo(user, "Deck");
    expect(await screen.findByText(/choose “Computer” under “Speak on” in Settings/)).toBeInTheDocument();
  });
});
