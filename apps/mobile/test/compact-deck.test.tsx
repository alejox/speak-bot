import { makeBoard, type Board, type Key } from "@speed-deck/core";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderRemoteApp, setScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

/*
 * The Deck on a phone (short or narrow window): only what playing needs, editing behind the Edit keys toggle.
 * jsdom cannot measure layout. Still manual, at 915x412, 800x360, 412x915 and 1024x768: every key of a
 * 4 x 3 board and its volume keys show without scrolling, each at least 48px.
 */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const PHONE_SHORT = { width: 800, height: 360 };
const PHONE_UPRIGHT = { width: 412, height: 915 };
const TABLET = { width: 1024, height: 768 };

const scene = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const volume = (slot: number, inputName: string, rows = 1): Key =>
  rows === 1 ? { slot, action: { type: "obs.inputVolume", inputName } } : { slot, span: { rows, columns: 1 }, action: { type: "obs.inputVolume", inputName } };
const deckBoard = (keys: Key[], size = { columns: 4, rows: 3 }): Board => makeBoard("stream", "Stream", "deck", keys, size);

async function openDeck(keys: Key[], size?: { columns: number; rows: number }) {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), deckBoard(keys, size)], volumes: { Music: 0.5, Mic: 1 } });
  const remote = renderRemoteApp({ state });
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  await goTo(remote.user, "Deck");
  await screen.findByRole("list", { name: "Keys of Stream" });
  return remote;
}

const editToggle = () => screen.queryByRole("button", { name: "Edit keys" });

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("the Deck on a phone, while playing", () => {
  it.each([PHONE_SIDEWAYS, PHONE_SHORT, PHONE_UPRIGHT])("hides the editing tools at $width x $height", async (size) => {
    setScreen(size);
    await openDeck([scene(0, "Intro"), scene(1, "Talk")]);
    expect(editToggle()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Grid size" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    // One page: no pager at all.
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add a key/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Options for key/ })).not.toBeInTheDocument();
    // A long press or right click runs nothing and opens no menu.
    fireEvent.contextMenu(screen.getByRole("button", { name: "Intro" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the pager when the board has more pages", async () => {
    setScreen(PHONE_SIDEWAYS);
    await openDeck([scene(0, "Intro"), scene(12, "Second page")]);
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
  });

  it("reaches every editing tool through the Edit keys toggle, and hides them again with it", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openDeck([scene(0, "Intro"), scene(1, "Talk")]);
    await user.click(editToggle()!);
    expect(editToggle()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a key at position 3" })).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Intro" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit key 1" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(editToggle()!);
    expect(editToggle()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Grid size" })).not.toBeInTheDocument();
  });

  it("keeps the tablet layout as it was: no toggle, editing always at hand", async () => {
    setScreen(TABLET);
    await openDeck([scene(0, "Intro"), scene(1, "Talk")]);
    expect(editToggle()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a key at position 3" })).toBeInTheDocument();
  });
});

export { volume };
