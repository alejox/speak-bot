import { buildDefaultBoard, makeBoard } from "@speed-deck/core";
import { createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setWideScreen, speakKey, writes } from "./app-fakes";

/** A DataTransfer stand-in for drag and drop in jsdom. */
function dataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "all",
    dropEffect: "none",
  };
}

function drag(source: Element, target: Element) {
  const transfer = dataTransfer();
  fireEvent(source, Object.assign(createEvent.dragStart(source), { dataTransfer: transfer }));
  fireEvent(target, Object.assign(createEvent.dragOver(target), { dataTransfer: transfer }));
  fireEvent(target, Object.assign(createEvent.drop(target), { dataTransfer: transfer }));
}

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const library = () => screen.getByRole("region", { name: "Actions" });
const keyEditor = () => screen.getByRole("region", { name: /^Key \d+/ });

async function openEditor(user: { click: (element: Element) => Promise<void> }) {
  await user.click(await screen.findByRole("button", { name: "Edit board" }));
  return screen.getByRole("heading", { name: "Board editor" });
}

describe("board editor on wide screens", () => {
  beforeEach(() => setWideScreen(true));
  afterEach(() => setWideScreen(false));

  it("shows boards, the key grid and the action library grouped by category", async () => {
    const { user } = renderRemoteApp();
    await openEditor(user);
    expect(screen.getByRole("region", { name: "Boards" })).toBeInTheDocument();
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(15);
    for (const category of ["Voice", "Captions", "Navigation", "OBS"]) {
      expect(within(library()).getByRole("region", { name: category })).toBeInTheDocument();
    }
    expect(screen.getByText("Select a key to edit it.")).toBeInTheDocument();
  });

  it("filters the library with search", async () => {
    const { user } = renderRemoteApp();
    await openEditor(user);
    await user.type(within(library()).getByRole("searchbox", { name: "Search actions" }), "scene");
    const names = within(library()).getAllByRole("listitem").map((item) => item.textContent);
    expect(names).toContainEqual(expect.stringContaining("Switch scene"));
    expect(names).not.toContainEqual(expect.stringContaining("Speak text"));
    await user.type(within(library()).getByRole("searchbox"), "zzz");
    expect(within(library()).getByText("No action matches.")).toBeInTheDocument();
  });

  it("assigns an action without parameters with the keyboard: select a key, then Assign", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hello", { color: "#16a34a" })])] });
    const { requests, user } = renderRemoteApp({ state });
    await openEditor(user);
    const assign = within(library()).getAllByRole("button", { name: "Assign" })[0]!;
    expect(assign).toHaveAccessibleDescription(/Select a key first/);
    expect(assign).toHaveAttribute("aria-disabled", "true");

    await user.click(within(grid()).getByRole("button", { name: "Edit key 1: Hello" }));
    await user.click(within(library()).getByRole("button", { name: "Assign “Stop voice” to key 1" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Edit key 1: Stop voice" })).toBeInTheDocument());
    expect(requests).toContainEqual({
      method: "PUT",
      url: "/api/boards/main/keys/0",
      body: { color: "#16a34a", action: { type: "voice.stop" }, replace: true },
    });
  });

  it("drags an action with parameters onto an empty key, then saves it from the key editor", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main")] });
    const { requests, user } = renderRemoteApp({ state });
    await openEditor(user);
    const item = within(library()).getByText("Switch scene").closest("li")!;
    drag(item, within(grid()).getByRole("button", { name: "Add a key at position 3" }));

    expect(screen.getByRole("status")).toHaveTextContent("“Switch scene” is on key 3. Fill in its details and save.");
    const editor = keyEditor();
    expect(within(editor).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Switch scene");
    const scene = await within(editor).findByRole("combobox", { name: "Scene" });
    await within(editor).findByRole("option", { name: "BRB" });
    await user.selectOptions(scene, "BRB");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Edit key 3: BRB" })).toBeInTheDocument());
    expect(requests).toContainEqual({
      method: "PUT",
      url: "/api/boards/main/keys/2",
      body: { label: "", icon: "", color: "", action: { type: "obs.switchScene", sceneName: "BRB" } },
    });
  });

  it("falls back to typing OBS names when OBS is not connected", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main")], scenes: null });
    const { user } = renderRemoteApp({ state });
    await openEditor(user);
    await user.click(within(grid()).getByRole("button", { name: "Add a key at position 1" }));
    await user.selectOptions(within(keyEditor()).getByRole("combobox", { name: "Action" }), "Switch scene");
    const scene = within(keyEditor()).getByRole("textbox", { name: "Scene" });
    expect(scene).toHaveAccessibleDescription("OBS is not connected: type the exact name.");
  });

  it("moves keys by dragging them onto another key, swapping the two", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A"), speakKey(1, "B")])] });
    const { requests, user } = renderRemoteApp({ state });
    await openEditor(user);
    drag(within(grid()).getByRole("button", { name: "Edit key 1: A" }), within(grid()).getByRole("button", { name: "Edit key 2: B" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Edit key 1: B" })).toBeInTheDocument());
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/main/keys/move", body: { from: 0, to: 1 } });
    expect(screen.getByRole("status")).toHaveTextContent("Key moved to position 2.");
  });

  it("opens a new page past the last one and moves a key there with the keyboard", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const { user } = renderRemoteApp({ state });
    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "New page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "Add a key at position 16" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous page" }));

    await user.click(within(grid()).getByRole("button", { name: "Edit key 1: A" }));
    const position = within(keyEditor()).getByRole("spinbutton", { name: "Move to position" });
    await user.clear(position);
    await user.type(position, "16");
    await user.click(within(keyEditor()).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Edit key 16: A" })).toBeInTheDocument());
  });

  it("validates the color and saves label, icon and color", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    const { requests, user } = renderRemoteApp({ state });
    await openEditor(user);
    await user.click(within(grid()).getByRole("button", { name: "Edit key 1: Hello" }));
    const editor = keyEditor();
    await user.type(within(editor).getByRole("textbox", { name: "Hex color" }), "#12");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    expect(within(editor).getByRole("alert")).toHaveTextContent("Type a color like #1a2b3c.");
    expect(within(editor).getByRole("textbox", { name: "Hex color" })).toHaveFocus();

    await user.type(within(editor).getByRole("textbox", { name: "Hex color" }), "AB56");
    await user.type(within(editor).getByRole("textbox", { name: "Label (optional)" }), "Hi");
    await user.click(within(editor).getByRole("radio", { name: "Star" }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: "PUT",
        url: "/api/boards/main/keys/0",
        body: { label: "Hi", icon: "star", color: "#12ab56", action: { type: "voice.speak", text: "Hello" }, replace: true },
      }),
    );
  });

  it("maps desktop errors to localized messages in the editor's live region", async () => {
    const state = desktopState({ boards: Array.from({ length: 2 }, (_, index) => makeBoard(`b${index}`, `Board ${index}`)) });
    const { user } = renderRemoteApp({ state });
    await openEditor(user);
    // The desktop refuses because another device deleted the other board meanwhile.
    state.boards = [state.boards[0]!];
    await user.click(screen.getByRole("button", { name: "Delete Board 1" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText("That board no longer exists.")).toBeInTheDocument();
  });

  it("creates, renames and deletes boards, and never the last one", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const { requests, user } = renderRemoteApp({ state });
    await openEditor(user);
    const boards = screen.getByRole("region", { name: "Boards" });
    const deleteMain = within(boards).getByRole("button", { name: "Delete Main" });
    expect(deleteMain).toHaveAttribute("aria-disabled", "true");
    expect(deleteMain).toHaveAccessibleDescription("The only board cannot be deleted.");

    await user.click(within(boards).getByRole("button", { name: "New board" }));
    const name = await within(boards).findByRole("textbox", { name: "New name for Board 2" });
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.type(name, "Games{Enter}");
    await waitFor(() => expect(within(boards).getByRole("button", { name: "Games" })).toHaveAttribute("aria-current", "true"));
    expect(writes(requests)).toEqual(["POST /api/boards", "PATCH /api/boards/new-1"]);

    await user.click(within(boards).getByRole("button", { name: "Delete Games" }));
    expect(within(boards).getByRole("button", { name: "No, keep it" })).toHaveFocus();
    await user.click(within(boards).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(within(boards).queryByRole("button", { name: "Games" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Deleted “Games”.");
  });

  it("restores the Communication board after confirming", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main")] });
    const { requests, user } = renderRemoteApp({ state });
    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "Restore “Communication”" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(writes(requests)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Restore “Communication”" }));
    await user.click(screen.getByRole("button", { name: "Yes, restore" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Edit key 1: Hello" })).toBeInTheDocument());
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/restore-default", body: { language: "en" } });
  });

  it("tests the draft action from the editor and goes back to the player", async () => {
    const { synthesizer, user } = renderLocalApp({ boards: [buildDefaultBoard("en")] });
    await openEditor(user);
    await user.click(within(grid()).getByRole("button", { name: "Edit key 1: Hello" }));
    fireEvent.click(within(keyEditor()).getByRole("button", { name: "Test" }));
    expect(synthesizer.texts).toEqual(["Hello"]);
    await user.click(screen.getByRole("button", { name: "Back to the board" }));
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
  });
});
