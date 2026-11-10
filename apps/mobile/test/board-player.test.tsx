import { buildDefaultBoard, buildDefaultDeckBoard } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS } from "../src/components/BoardPlayer";
import { boardOf, renderLocalApp, speakKey } from "./app-fakes";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });

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
    renderLocalApp({ boards: [buildDefaultDeckBoard("en")] });
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

  it("adds a key on an empty space with an action from the grouped list", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    const dialog = screen.getByRole("dialog", { name: "Edit key 2" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose an action for the key.");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Action" }), "Go to page");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Fill in “Page”.");
    await user.type(within(dialog).getByRole("spinbutton", { name: "Page" }), "2");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Page 2" })).toBeInTheDocument();
  });

  it("tests a speak key from the editor synchronously, without saving", async () => {
    const { synthesizer, user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Hello" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Test" }));
    expect(synthesizer.texts).toEqual(["Hello"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a key after an inline confirmation", async () => {
    const { user } = renderLocalApp();
    await screen.findByRole("button", { name: "Hello" });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Hello" }));
    const dialog = screen.getByRole("dialog");
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
    fireEvent.contextMenu(screen.getByRole("button", { name: "Hello" }));
    const dialog = screen.getByRole("dialog");
    const position = within(dialog).getByRole("spinbutton", { name: "Move to position" });
    await user.clear(position);
    await user.type(position, "17");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Key moved to position 17.");
  });

  it("opens the editor with a long press, and a keyboard press afterwards still runs the key", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { synthesizer } = renderLocalApp({ boards: [buildDefaultBoard("en")] });
    const key = await screen.findByRole("button", { name: "Hello" });
    fireEvent.pointerDown(key);
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The release ends the press without a click; then the dialog is closed.
    fireEvent.pointerUp(key);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Keyboard activation (click with detail 0) must not be swallowed by the earlier long press.
    fireEvent.click(screen.getByRole("button", { name: "Hello" }), { detail: 0 });
    expect(synthesizer.texts).toEqual(["Hello"]);
  });

  it("swallows only the click that ends a long press", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { synthesizer } = renderLocalApp({ boards: [buildDefaultBoard("en")] });
    const key = await screen.findByRole("button", { name: "Hello" });
    fireEvent.pointerDown(key);
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(key, { detail: 1 });
    expect(synthesizer.texts).toEqual([]);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Hello" }), { detail: 1 });
    expect(synthesizer.texts).toEqual(["Hello"]);
  });
});

describe("Speak section", () => {
  it("offers the first five speak keys of the current board and saves typed text on a free key", async () => {
    const { synthesizer, user } = renderLocalApp({
      boards: [boardOf("main", "Main", [speakKey(0, "One"), { slot: 1, action: { type: "voice.stop" } }, speakKey(2, "Two"), speakKey(3, "3"), speakKey(4, "4"), speakKey(5, "5"), speakKey(6, "6")])],
    });
    await screen.findByRole("button", { name: "One" });
    await user.click(screen.getByRole("link", { name: "Speak" }));
    const quick = screen.getByRole("region", { name: "Quick keys" });
    expect(within(quick).getAllByRole("button").map((button) => button.textContent)).toEqual(["One", "Two", "3", "4", "5"]);
    fireEvent.click(within(quick).getByRole("button", { name: "Two" }));
    expect(synthesizer.texts).toEqual(["Two"]);

    await user.click(screen.getByRole("button", { name: "Save as key" }));
    expect(screen.getByRole("status")).toHaveTextContent("Type something to save it on a key.");
    await user.type(screen.getByRole("textbox", { name: "Text to speak" }), "See you");
    await user.click(screen.getByRole("button", { name: "Save as key" }));
    expect(await screen.findByText("Saved on key 8.")).toBeInTheDocument();
  });
});
