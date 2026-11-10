import { buildDefaultBoard, buildDefaultDeckBoard } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardOf, renderLocalApp, speakKey } from "./app-fakes";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });

/** Opens the key dialog the only way there is on a phone: edit mode, then the key. */
async function editKey(user: { click: (element: Element) => Promise<void> }, name: string) {
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
}

describe("board player in phone-only mode", () => {
  afterEach(() => vi.useRealTimers());

  it("creates the Communication board on a new device and shows a page of 15 keys", async () => {
    renderLocalApp();
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Board" })).toHaveDisplayValue("Communication");
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(15);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("speaks a key synchronously inside the tap (iOS rule)", async () => {
    const { synthesizer } = renderLocalApp();
    const key = await screen.findByRole("button", { name: "Hello" });
    fireEvent.click(key);
    // No await between the tap and speak().
    expect(synthesizer.texts).toEqual(["Hello"]);
  });

  it("disables caption keys without the desktop and says why", async () => {
    const { user } = renderLocalApp({ boards: [buildDefaultDeckBoard("en")] });
    await user.click(screen.getByRole("link", { name: "Deck" }));
    const clear = await screen.findByRole("button", { name: "Clear caption" });
    expect(clear).toHaveAttribute("aria-disabled", "true");
    expect(clear).toHaveAccessibleDescription("Needs the computer app.");
  });

  it("switches the voice language with its key and shows the current one", async () => {
    const { synthesizer, user } = renderLocalApp();
    const language = await screen.findByRole("button", { name: /Switch voice language/ });
    expect(language).toHaveTextContent("Voice: English");
    await user.click(language);
    expect(language).toHaveTextContent("Voice: Español");
    expect(screen.getByRole("status")).toHaveTextContent("Voice language: Español.");
    await user.click(screen.getByRole("button", { name: "Hello" }));
    expect(synthesizer.spoken.at(-1)?.options?.voiceId).toBe("monica");
  });

  it("stops and repeats speech on this device", async () => {
    const { synthesizer, user } = renderLocalApp();
    await user.click(await screen.findByRole("button", { name: "Repeat" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nothing has been said yet to repeat.");
    await user.click(screen.getByRole("button", { name: "Hello" }));
    await user.click(screen.getByRole("button", { name: "Repeat" }));
    expect(synthesizer.texts).toEqual(["Hello", "Hello"]);
    await user.click(screen.getByRole("button", { name: "Stop voice" }));
    expect(synthesizer.cancelled).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Voice stopped.");
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
    await user.selectOptions(screen.getByRole("combobox", { name: "Board" }), "Other");
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
  });

  it("pages with the pager buttons", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One"), speakKey(20, "Two")])] });
    await screen.findByRole("button", { name: "One" });
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Next page" }).at(-1)!);
    expect(screen.getByRole("button", { name: "Two" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Next page" }).at(-1)).toBeDisabled();
  });

  it("shows custom key colors with readable text", async () => {
    renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Light", { color: "#facc15" }), speakKey(1, "Dark", { color: "#1d4ed8" })])] });
    expect(await screen.findByRole("button", { name: "Light" })).toHaveStyle({ color: "#000000" });
    expect(screen.getByRole("button", { name: "Dark" })).toHaveStyle({ color: "#ffffff" });
  });
});

describe("key editing on the phone", () => {
  afterEach(() => vi.useRealTimers());

  it("edits a key in a modal from edit mode and returns focus to it", async () => {
    const { user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Edit key 1: Hello" }));
    const dialog = screen.getByRole("dialog", { name: "Edit key 1" });
    expect(within(dialog).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Speak text");
    await user.type(within(dialog).getByRole("textbox", { name: "Label (optional)" }), "Hi");
    await user.click(within(dialog).getByRole("radio", { name: "Heart" }));
    await user.click(within(dialog).getByRole("radio", { name: "Green" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const key = screen.getByRole("button", { name: "Edit key 1: Hi" });
    expect(key).toHaveFocus();
    expect(key).toHaveStyle({ background: "#16a34a" });
  });

  it("adds a key from the + on an empty space: an action without parameters is saved at once", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    const dialog = screen.getByRole("dialog", { name: "Add key 2" });
    expect(within(dialog).getAllByRole("region").map((group) => group.getAttribute("aria-label"))).toEqual(["Voice", "Navigation"]);
    await user.click(within(dialog).getByRole("button", { name: "Stop voice" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(grid()).getByRole("button", { name: "Stop voice" })).toBeInTheDocument();
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
    const plus = screen.getByRole("button", { name: "Add a key at position 3" });
    await user.click(plus);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plus).toHaveFocus();
  });

  it("tests a speak key from the editor synchronously, without saving", async () => {
    const { synthesizer, user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    const dialog = await editKey(user, "Edit key 1: Hello");
    fireEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    expect(synthesizer.texts).toEqual(["Hello"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a key after an inline confirmation", async () => {
    const { user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    const dialog = await editKey(user, "Edit key 1: Hello");
    await user.click(within(dialog).getByRole("button", { name: "Delete key" }));
    expect(within(dialog).getByRole("button", { name: "No, keep it" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Hello" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Key deleted.");
  });

  it("moves a key to another position from the editor", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    const dialog = await editKey(user, "Edit key 1: Hello");
    const position = within(dialog).getByRole("spinbutton", { name: "Move to position" });
    await user.clear(position);
    await user.type(position, "17");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Key moved to position 17.");
  });

  it("never opens the editor from a slow press or a right click outside edit mode", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { synthesizer } = renderLocalApp({ boards: [buildDefaultBoard("en")] });
    const key = await screen.findByRole("button", { name: "Hello" });
    fireEvent.pointerDown(key);
    act(() => void vi.advanceTimersByTime(3000));
    fireEvent.pointerUp(key);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The click that ends a slow press runs the key like any other tap.
    fireEvent.click(key, { detail: 1 });
    expect(synthesizer.texts).toEqual(["Hello"]);

    expect(fireEvent.contextMenu(key)).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains edit mode without mentioning holding a key or right-clicking", async () => {
    const { user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const hint = screen.getByText(/Tap a key to change it/);
    expect(hint).not.toHaveTextContent(/hold|right-click/i);
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
