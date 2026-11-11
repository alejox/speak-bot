import { makeBoard, type Board, type Key, type ObsState } from "@speed-deck/core";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { displayedCellIndexes } from "../src/app/board-display";
import { NAV_COLLAPSED_STORAGE_KEY } from "../src/app/use-section";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

/*
 * jsdom cannot measure layout. Still manual, on 390x844, 844x390, 768x1024 and 1280x800: the document and
 * the page of keys never scroll, the keys are square and as large as fits, start at the top when the window
 * is upright, and the header stays on one row.
 */
const PHONE_UPRIGHT = { width: 390, height: 844 };
const PHONE_SIDEWAYS = { width: 844, height: 390 };
const TABLET_UPRIGHT = { width: 768, height: 1024 };

const sceneKey = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [sceneKey(0, "Main")], "deck")];
const idle: ObsState = { currentScene: "BRB", mutedInputs: [], streaming: false, recording: false };
const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const drawnSlots = () => within(grid()).getAllByRole("listitem").map((cell) => Number(cell.getAttribute("data-slot")));
/** A 6 x 4 voice board with keys on slots 0, 1 (first row) and 6 (second row, first column). */
const sixByFour = (): Board => makeBoard("talk", "Talk", "voice", [speakKey(0, "K0"), speakKey(1, "K1"), speakKey(6, "K6")], { columns: 6, rows: 4 });

/** Phones play with the editing tools put away: bring them out where the Edit keys toggle is offered. */
async function editKeys(user: { click: (element: Element) => Promise<void> }) {
  const toggle = screen.queryByRole("button", { name: "Edit keys" });
  if (toggle) await user.click(toggle);
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("a space below the inspector width", () => {
  it("shows the Deck as one compact row: hidden heading and page text, the status as an icon, the pager arrows while editing", async () => {
    setScreen(PHONE_UPRIGHT);
    const state = desktopState({ boards: boards() });
    state.obs = { enabled: true, status: "connected", state: idle };
    const { user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).toHaveClass("visually-hidden");
    expect(await screen.findByRole("img", { name: "OBS connected" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Deck status" })).not.toBeInTheDocument();
    // A phone plays with the editing tools (and a one-page pager) put away; the Edit keys toggle brings them back.
    await user.click(screen.getByRole("button", { name: "Edit keys" }));
    expect(screen.getByText("Page 1 of 1")).toHaveClass("visually-hidden");
    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
  });

  it("keeps the Voice composer behind the Write button, under a hidden heading, with no side panel", async () => {
    setScreen(PHONE_UPRIGHT);
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toHaveClass("visually-hidden");
    // A phone keeps the screen for the keys: the composer waits in a sheet behind Write.
    expect(within(screen.getByRole("main")).getByRole("button", { name: "Write" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await editKeys(user);
    expect(screen.getByText("Page 1 of 1")).toHaveClass("visually-hidden");
    // What the composer says back stays on screen there.
    expect(screen.getAllByRole("status").find((element) => element.classList.contains("status"))).not.toHaveClass("visually-hidden");
  });

  it.each([PHONE_UPRIGHT, PHONE_SIDEWAYS, TABLET_UPRIGHT])("still edits a key in the dialog at $width x $height", async (size) => {
    setScreen(size);
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await editKeys(user);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Hi" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit key 1" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("the sidebar in a short window", () => {
  const nav = () => screen.getByRole("navigation", { name: "Sections" });

  it("shows as the icon rail without a toggle and without changing the stored choice", async () => {
    setScreen(PHONE_SIDEWAYS);
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(nav()).toHaveClass("side-nav-collapsed");
    expect(within(nav()).getByRole("link", { name: "Voice" })).toHaveAttribute("title", "Voice");
    expect(screen.queryByRole("button", { name: /menu$/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY)).toBeNull();
  });

  it("keeps the labelled sidebar and its toggle in a tall one", async () => {
    setScreen(TABLET_UPRIGHT);
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(nav()).not.toHaveClass("side-nav-collapsed");
    expect(screen.getByRole("button", { name: "Collapse menu" })).toBeInTheDocument();
  });
});

describe("the order cells are drawn in", () => {
  it("reads row by row as stored", () => {
    expect(displayedCellIndexes(3, 2, false)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("turns each stored row into a column when transposed", () => {
    // Stored 3 x 2: [0 1 2 / 3 4 5]. Drawn 2 x 3: [0 3 / 1 4 / 2 5].
    expect(displayedCellIndexes(3, 2, true)).toEqual([0, 3, 1, 4, 2, 5]);
  });

  it("leaves a square page alone", () => {
    expect(displayedCellIndexes(3, 3, true)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("a board on a phone held upright", () => {
  it("draws a 6 x 4 page as 4 columns of 6, each stored row as a column", async () => {
    setScreen(PHONE_UPRIGHT);
    const { user } = renderLocalApp({ boards: [sixByFour()] });
    await screen.findByRole("button", { name: "K0" }, { timeout: 5000 });
    await editKeys(user);
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("4");
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("6");
    expect(drawnSlots()).toEqual([0, 6, 12, 18, 1, 7, 13, 19, 2, 8, 14, 20, 3, 9, 15, 21, 4, 10, 16, 22, 5, 11, 17, 23]);
    expect(within(grid()).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
      "K0",
      "Options for key 1",
      "K6",
      "Options for key 7",
      "K1",
      "Options for key 2",
      "Add a key at position 8",
    ]);
  });

  it("runs, edits and adds on the real slot of a transposed cell", async () => {
    setScreen(PHONE_UPRIGHT);
    const { user, synthesizer } = renderLocalApp({ boards: [sixByFour()] });
    fireEvent.click(await screen.findByRole("button", { name: "K6" }));
    expect(synthesizer.texts).toEqual(["K6"]);
    await editKeys(user);

    fireEvent.contextMenu(screen.getByRole("button", { name: "K6" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit key 7" });
    expect(within(dialog).getByRole("spinbutton", { name: "Move to position" })).toHaveValue(7);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Add a key at position 8" }));
    expect(screen.getByRole("dialog", { name: "Add key 8" })).toBeInTheDocument();
  });

  it.each([PHONE_SIDEWAYS, TABLET_UPRIGHT, { width: 1280, height: 800 }])("draws the page as stored at $width x $height", async (size) => {
    setScreen(size);
    const { user } = renderLocalApp({ boards: [sixByFour()] });
    await screen.findByRole("button", { name: "K0" }, { timeout: 5000 });
    await editKeys(user);
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("6");
    expect(drawnSlots().slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
