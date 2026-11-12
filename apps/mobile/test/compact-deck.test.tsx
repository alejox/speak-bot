import { makeBoard, type Board, type Key } from "@speed-deck/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

async function openDeck(keys: Key[], size?: { columns: number; rows: number }, mutedInputs: string[] = []) {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), deckBoard(keys, size)], volumes: { Music: 0.5, Mic: 1 } });
  state.obs = { enabled: true, status: "connected", state: { currentScene: "Main", mutedInputs, streaming: false, recording: false } };
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

describe("the Deck's keys on a phone, while playing", () => {
  const grid = () => screen.getByRole("list", { name: "Keys of Stream" });
  const cells = () => within(grid()).getAllByRole("listitem");
  const cellOf = (slot: number) => grid().querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  const sevenScenes = () => Array.from({ length: 7 }, (_, slot) => scene(slot, `Scene ${slot}`));

  it("draws only the keys, on the rows and columns they use, each in its own place", async () => {
    setScreen(PHONE_SIDEWAYS);
    await openDeck(sevenScenes());
    expect(cells()).toHaveLength(7);
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("4");
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("2");
    // Slot 5 is the second row, second column, wherever the empty cells around it went.
    expect(cellOf(5)!.style.getPropertyValue("--cell-row")).toBe("2");
    expect(cellOf(5)!.style.getPropertyValue("--cell-column")).toBe("2");
  });

  it("keeps a gap inside the keys it uses, and drops only the empty rows and columns after them", async () => {
    setScreen(PHONE_SIDEWAYS);
    await openDeck([scene(0, "Intro"), scene(9, "Outro")]);
    expect(cells()).toHaveLength(2);
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("2");
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("3");
    expect(cellOf(9)!.style.getPropertyValue("--cell-row")).toBe("3");
    expect(cellOf(9)!.style.getPropertyValue("--cell-column")).toBe("2");
  });

  it("turns the used rows into columns when the phone is upright", async () => {
    setScreen(PHONE_UPRIGHT);
    await openDeck(sevenScenes());
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("2");
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("4");
    expect(cellOf(5)!.style.getPropertyValue("--cell-row")).toBe("2");
    expect(cellOf(5)!.style.getPropertyValue("--cell-column")).toBe("2");
  });

  it("shows the whole board again, empty places and +, while editing", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openDeck(sevenScenes());
    await user.click(editToggle()!);
    expect(cells()).toHaveLength(12);
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("3");
    expect(screen.getByRole("button", { name: "Add a key at position 8" })).toBeInTheDocument();
  });
});

describe("the volume keys on a phone, while playing", () => {
  const grid = () => screen.getByRole("list", { name: "Keys of Stream" });
  const mixer = () => screen.queryByRole("group", { name: "Volume" });
  // The device's board: four scenes, then two faders down the right, three more scenes under the first ones.
  const deviceBoard = () => [
    scene(0, "Intro"),
    scene(1, "Talk"),
    scene(2, "Stream"),
    scene(3, "Outro"),
    volume(4, "Music", 3),
    volume(5, "Mic", 3),
    scene(6, "Monitor"),
    scene(7, "Capture"),
    scene(8, "Wide"),
  ];

  it("moves them out of the grid into a mixer beside it, so the grid keeps only the other keys", async () => {
    setScreen(PHONE_SIDEWAYS);
    await openDeck(deviceBoard(), { columns: 6, rows: 3 }, ["Mic"]);
    const strip = mixer()!;
    expect(within(strip).getAllByRole("slider").map((slider) => slider.getAttribute("aria-label"))).toEqual(["Music", "Mic"]);
    expect(within(grid()).queryByRole("slider")).not.toBeInTheDocument();
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("4");
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("2");
    // Each fader keeps its look: upright on its side, muted when OBS mutes the input.
    const [music, mic] = within(strip).getAllByRole("slider").map((slider) => slider.closest(".deck-volume")!);
    expect(music).toHaveClass("deck-volume-vertical");
    expect(music).not.toHaveClass("deck-volume-muted");
    expect(mic).toHaveClass("deck-volume-muted");
    expect(within(strip).getByRole("slider", { name: "Music" })).toBeEnabled();
  });

  it.each([PHONE_SIDEWAYS, PHONE_UPRIGHT])("puts Mute and Monitor under each fader at $width x $height, playable without editing", async (size) => {
    setScreen(size);
    const { requests, user } = await openDeck(deviceBoard(), { columns: 6, rows: 3 }, ["Mic"]);
    const strip = mixer()!;
    const mic = within(strip).getByRole("slider", { name: "Mic" }).closest<HTMLElement>(".deck-volume")!;
    const mute = within(mic).getByRole("button", { name: "Mute Mic" });
    expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(within(mic).getByRole("button", { name: "Monitor Mic" })).toHaveAttribute("aria-pressed", "false");
    await user.click(mute);
    await waitFor(() =>
      expect(requests).toContainEqual({ method: "POST", url: "/api/actions/execute", body: { action: { type: "obs.toggleMute", inputName: "Mic" } } }),
    );
  });

  it("lays the faders under the keys when the phone is upright", async () => {
    setScreen(PHONE_UPRIGHT);
    await openDeck(deviceBoard(), { columns: 6, rows: 3 });
    const music = within(mixer()!).getByRole("slider", { name: "Music" }).closest(".deck-volume");
    expect(music).not.toHaveClass("deck-volume-vertical");
  });

  it("puts them back on their cells while editing, and on tablets", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openDeck(deviceBoard(), { columns: 6, rows: 3 });
    await user.click(editToggle()!);
    expect(mixer()).not.toBeInTheDocument();
    expect(within(grid()).getAllByRole("slider")).toHaveLength(2);
  });

  it("keeps the tablet grid as it was", async () => {
    setScreen(TABLET);
    await openDeck(deviceBoard(), { columns: 6, rows: 3 });
    expect(mixer()).not.toBeInTheDocument();
    expect(within(grid()).getAllByRole("slider")).toHaveLength(2);
  });
});
