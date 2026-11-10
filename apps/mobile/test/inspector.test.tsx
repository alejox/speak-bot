import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setWideScreen, speakKey } from "./app-fakes";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const inspector = () => screen.getByRole("complementary", { name: /^Key \d+/ });

describe("key inspector on wide screens", () => {
  beforeEach(() => setWideScreen(true));
  afterEach(() => setWideScreen(false));

  it("edits a key chosen from its menu in a side panel instead of a modal", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    const { requests, user } = renderRemoteApp({ state });
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Hello" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const panel = inspector();
    expect(panel).toHaveAccessibleName("Key 1");
    expect(within(panel).getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(within(panel).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Speak text");
    await user.type(within(panel).getByRole("textbox", { name: "Label (optional)" }), "Hi");
    expect(within(panel).getByRole("heading", { name: "Hi" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("radio", { name: "Green" }));
    await user.click(within(panel).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: "PUT",
        url: "/api/boards/main/keys/0",
        body: { label: "Hi", icon: "", color: "#16a34a", action: { type: "voice.speak", text: "Hello" }, replace: true },
      }),
    );
    expect(await within(grid()).findByRole("button", { name: "Hi" })).toHaveClass("deck-key-selected");
    await user.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary", { name: /^Key/ })).not.toBeInTheDocument();
  });

  it("still runs a key on a plain tap", async () => {
    const { synthesizer } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    fireEvent.click(await screen.findByRole("button", { name: "Hello" }));
    expect(synthesizer.texts).toEqual(["Hello"]);
    expect(screen.queryByRole("complementary", { name: /^Key/ })).not.toBeInTheDocument();
  });

  it("saves an action without parameters from the + at once and selects the new key", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await user.click(await screen.findByRole("button", { name: "Add a key at position 2" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 2" })).getByRole("button", { name: "Stop voice" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(inspector()).toHaveAccessibleName("Key 2");
    expect(within(inspector()).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Stop voice");
    expect(within(grid()).getByRole("button", { name: "Stop voice" })).toHaveClass("deck-key-selected");
  });

  it("takes an action with parameters from the picker to the panel for its details", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    await user.click(await screen.findByRole("button", { name: "Add a key at position 2" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Go to page" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const panel = inspector();
    expect(within(panel).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Go to page");
    const page = within(panel).getByRole("spinbutton", { name: "Page" });
    expect(page).toHaveFocus();
    await user.type(page, "2");
    await user.click(within(panel).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(grid()).getByRole("button", { name: "Page 2" })).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Key saved.");
  });
});
