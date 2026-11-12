import { buildDefaultBoard, buildDefaultDeckBoard } from "@speed-deck/core";
import { act, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardPill, chooseBoard } from "./board-picker";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setWideScreen, speakKey } from "./app-fakes";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });

/** Opens the key dialog from the key's menu (a right click here). */
async function editKey(user: { click: (element: Element) => Promise<void> }, name: string) {
  fireEvent.contextMenu(screen.getByRole("button", { name }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  return screen.getByRole("dialog");
}

/** Drags `source` onto `target` with a DataTransfer stand-in (jsdom has none). */
function drag(source: Element, target: Element) {
  const data = new Map<string, string>();
  const transfer = {
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "all",
    dropEffect: "none",
  };
  fireEvent(source, Object.assign(createEvent.dragStart(source), { dataTransfer: transfer }));
  fireEvent(target, Object.assign(createEvent.dragOver(target), { dataTransfer: transfer }));
  fireEvent(target, Object.assign(createEvent.drop(target), { dataTransfer: transfer }));
}

describe("board player in phone-only mode", () => {
  afterEach(() => vi.useRealTimers());

  it("creates the Communication board on a new device: its phrases on a page of 15 slots, its voice commands out of sight", async () => {
    renderLocalApp();
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(boardPill()).toHaveAccessibleName("Board: Communication");
    // The seeded Stop, Repeat, caption and language keys stay stored but show as blank places on Voice boards.
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(15);
    expect(within(grid()).queryByRole("button", { name: "Repeat" })).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("speaks a key synchronously inside the tap (iOS rule)", async () => {
    const { synthesizer } = renderLocalApp();
    const key = await screen.findByRole("button", { name: "Hello" });
    fireEvent.click(key);
    // No await between the tap and speak().
    expect(synthesizer.texts).toEqual(["Hello"]);
  });

  it("runs navigation keys in this client and remembers the page", async () => {
    const keys = [speakKey(0, "First"), { slot: 1, action: { type: "nav.nextPage" as const } }, speakKey(15, "Second page")];
    const { user, view } = renderLocalApp({ boards: [boardOf("main", "Main", keys), boardOf("other", "Other", [speakKey(0, "Other")])] });
    await screen.findByRole("button", { name: "First" });
    await user.click(within(grid()).getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: "Second page" })).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    view.unmount();
    renderLocalApp();
    expect(await screen.findByRole("button", { name: "Second page" })).toBeInTheDocument();
    await chooseBoard(user, "Other");
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
  });

  it("pages with the pager buttons", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One"), speakKey(20, "Two")])] });
    await screen.findByRole("button", { name: "One" });
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Next page" }).at(-1)!);
    expect(screen.getByRole("button", { name: "Two" })).toBeInTheDocument();
    // Past the last page the pager offers a new one instead.
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeEnabled();
  });

  it("shows a single + after the last key of the page; other empty spaces stay blank", async () => {
    renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One"), speakKey(3, "Two")])] });
    await screen.findByRole("button", { name: "One" });
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(15);
    expect(within(grid()).getAllByRole("button", { name: /^Add a key/ }).map((button) => button.getAttribute("aria-label"))).toEqual(["Add a key at position 5"]);
  });

  it("puts the + in the first gap when the page's last space is taken", async () => {
    renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One"), speakKey(14, "Last")])] });
    await screen.findByRole("button", { name: "One" });
    expect(within(grid()).getAllByRole("button", { name: /^Add a key/ }).map((button) => button.getAttribute("aria-label"))).toEqual(["Add a key at position 2"]);
  });

  it("shows custom key colors with readable text", async () => {
    renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Light", { color: "#facc15" }), speakKey(1, "Dark", { color: "#1d4ed8" })])] });
    expect(await screen.findByRole("button", { name: "Light" })).toHaveStyle({ color: "#000000" });
    expect(screen.getByRole("button", { name: "Dark" })).toHaveStyle({ color: "#ffffff" });
  });
});

describe("key editing in the player", () => {
  afterEach(() => vi.useRealTimers());

  it("edits a key from its menu (right click) in a modal and returns focus to it", async () => {
    const { user } = renderLocalApp();
    const hello = await screen.findByRole("button", { name: "Hello" });
    expect(fireEvent.contextMenu(hello)).toBe(false);
    const menu = screen.getByRole("menu", { name: "Key 1: Hello" });
    await user.click(within(menu).getByRole("menuitem", { name: "Edit" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Edit key 1" });
    expect(within(dialog).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Speak text");
    await user.type(within(dialog).getByRole("textbox", { name: "Label (optional)" }), "Hi");
    await user.click(within(dialog).getByRole("radio", { name: "Heart" }));
    await user.click(within(dialog).getByRole("radio", { name: "Green" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const key = screen.getByRole("button", { name: "Hi" });
    expect(key).toHaveFocus();
    expect(key).toHaveStyle({ backgroundColor: "#16a34a" });
  });

  it("adds a key from the + on an empty space: an action without parameters is saved at once", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    const dialog = screen.getByRole("dialog", { name: "Add key 2" });
    // Voice offers phrases and navigation; captions, Stop, Repeat and the language key are gone.
    expect(within(dialog).getAllByRole("region").map((group) => group.getAttribute("aria-label"))).toEqual(["Voice", "Navigation"]);
    await user.click(within(dialog).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(grid()).getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Key saved.");
  });

  it("asks for the details of an action with parameters in the same modal, and goes back to the actions", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    const dialog = screen.getByRole("dialog", { name: "Add key 2" });
    await user.type(within(dialog).getByRole("searchbox", { name: "Search actions" }), "page");
    expect(within(dialog).queryByRole("button", { name: "Speak text" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Go to page" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Fill in “Page”.");
    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(within(dialog).getByRole("button", { name: "Go to page" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Go to page" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "Page" }), "2");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(grid()).getByRole("button", { name: "Page 2" })).toBeInTheDocument();
  });

  it("closes the add dialog with Escape and returns focus to the +", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    const plus = screen.getByRole("button", { name: "Add a key at position 2" });
    await user.click(plus);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plus).toHaveFocus();
  });

  it("tests a speak key from the editor synchronously, without saving", async () => {
    const { synthesizer, user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    const dialog = await editKey(user, "Hello");
    fireEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    expect(synthesizer.texts).toEqual(["Hello"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a key from its menu after an inline confirmation, never from the edit dialog", async () => {
    const { user } = renderLocalApp();
    const hello = await screen.findByRole("button", { name: "Hello" });
    const dialog = await editKey(user, "Hello");
    expect(within(dialog).queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.contextMenu(hello);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const confirm = screen.getByRole("group", { name: "Delete “Hello”? This cannot be undone." });
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(hello).toHaveFocus();

    fireEvent.contextMenu(hello);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Hello" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Key deleted.");
  });

  it("opens the key menu with the keyboard, moves through it with the arrows and closes it with Escape", async () => {
    const { user } = renderLocalApp();
    const hello = await screen.findByRole("button", { name: "Hello" });
    hello.focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(hello).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Options for key 1" }));
    expect(screen.getByRole("menu", { name: "Key 1: Hello" })).toBeInTheDocument();
  });

  it("opens the key menu with a long press without running the key, and a short tap still runs it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { synthesizer } = renderLocalApp({ boards: [buildDefaultBoard("en")] });
    const key = await screen.findByRole("button", { name: "Hello" });
    fireEvent.pointerDown(key, { pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.getByRole("menu", { name: "Key 1: Hello" })).toBeInTheDocument();
    fireEvent.pointerUp(key, { pointerType: "touch" });
    fireEvent.click(key, { detail: 1 });
    expect(synthesizer.texts).toEqual([]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.pointerDown(key, { pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerUp(key, { pointerType: "touch" });
    fireEvent.click(key, { detail: 1 });
    expect(synthesizer.texts).toEqual(["Hello"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves keys by dragging one onto another with a mouse, swapping the two", async () => {
    setWideScreen(true);
    try {
      const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A"), speakKey(1, "B")])] });
      const { requests } = renderRemoteApp({ state });
      await screen.findByRole("button", { name: "A" });
      drag(within(grid()).getByRole("button", { name: "A" }), within(grid()).getByRole("button", { name: "B" }));
      await waitFor(() => expect(within(grid()).getAllByRole("button", { name: /^[AB]$/ }).map((key) => key.textContent)).toEqual(["B", "A"]));
      expect(requests).toContainEqual({ method: "POST", url: "/api/boards/main/keys/move", body: { from: 0, to: 1 } });
      expect(screen.getByRole("status")).toHaveTextContent("Key moved to position 2.");
    } finally {
      setWideScreen(false);
    }
  });

  it("moves a key to another position from the editor", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    const dialog = await editKey(user, "Hello");
    const position = within(dialog).getByRole("spinbutton", { name: "Move to position" });
    await user.clear(position);
    await user.type(position, "17");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Key moved to position 17.");
  });
});

describe("Voice space composer", () => {
  it("saves typed text on the first free key of the current voice board, shown on the same screen", async () => {
    const { synthesizer, user } = renderLocalApp({
      boards: [boardOf("main", "Main", [speakKey(0, "One"), { slot: 1, action: { type: "voice.stop" } }, speakKey(3, "Two")]), boardOf("stream", "Stream", [], "deck")],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Two" }));
    expect(synthesizer.texts).toEqual(["Two"]);

    await user.click(screen.getByRole("button", { name: "Save as key" }));
    expect(screen.getByRole("status")).toHaveTextContent("Type something to save it on a key.");
    await user.type(screen.getByRole("textbox", { name: "Text to speak" }), "See you");
    await user.click(screen.getByRole("button", { name: "Save as key" }));
    expect(await screen.findByText("Saved on key 3.")).toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "See you" })).toBeInTheDocument();
  });
});
