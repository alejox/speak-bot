import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { KEYS_PER_PAGE, type Key } from "@speed-deck/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setWideScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

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

const sceneKey = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const emptyPanel = () => screen.getByRole("complementary", { name: "New key" });

describe("empty key inspector in the Deck on wide screens", () => {
  afterEach(() => setWideScreen(false));

  it("keeps the panel open with nothing selected and adds a key from it", async () => {
    setWideScreen(true);
    const { user } = renderLocalApp({ boards: [boardOf("stream", "Stream", [sceneKey(0, "Main")], "deck")] });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Main" });
    const panel = emptyPanel();
    expect(within(panel).getByRole("heading", { name: "New key" })).toBeInTheDocument();
    expect(panel).toHaveTextContent("Add a key, or right-click a key to edit it.");
    await user.click(within(panel).getByRole("button", { name: "Add key" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 2" })).getByRole("button", { name: "Start or stop stream" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(inspector()).toHaveAccessibleName("Key 2");
    expect(within(inspector()).getByRole("combobox", { name: "Action" })).toHaveDisplayValue("Start or stop stream");
    expect(screen.queryByRole("complementary", { name: "New key" })).not.toBeInTheDocument();
    expect(grid().querySelector(".deck-key-selected")).not.toBeNull();

    await user.click(within(inspector()).getByRole("button", { name: "Close" }));
    expect(emptyPanel()).toBeInTheDocument();
  });

  it("disables Add key when the page on screen is full", async () => {
    setWideScreen(true);
    const keys = Array.from({ length: KEYS_PER_PAGE }, (_, slot) => sceneKey(slot, `Scene ${slot + 1}`));
    const { user } = renderLocalApp({ boards: [boardOf("stream", "Stream", keys, "deck")] });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Scene 1" });
    const add = within(emptyPanel()).getByRole("button", { name: "Add key" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription("This page is full. Go to another page to add a key.");
  });

  it("shows no panel on narrow screens", async () => {
    setWideScreen(false);
    const { user } = renderLocalApp({ boards: [boardOf("stream", "Stream", [sceneKey(0, "Main")], "deck")] });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Main" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
