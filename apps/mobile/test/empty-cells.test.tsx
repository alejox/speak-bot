import { makeBoard, type Action, type Board, type Key } from "@speed-deck/core";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardNavigation } from "../src/app/use-boards";
import { BoardPlayer } from "../src/components/BoardPlayer";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

/*
 * Every empty cell that is drawn is a + (an add button named by its own position) wherever the board can be
 * edited in that view, so nobody has to look for the one cell that adds a key. Cells that are not drawn
 * (the Deck playing on a phone), slots holding a stored key that Voice no longer shows, and boards that
 * cannot be edited from this page stay as they were.
 */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const TABLET = { width: 1024, height: 768 };
const WIDE = { width: 1440, height: 900, finePointer: true };

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const addPositions = () =>
  within(grid())
    .queryAllByRole("button", { name: /^Add a key at position/ })
    .map((button) => Number(button.getAttribute("aria-label")!.replace(/\D+/g, "")));
const blanks = () => [...grid().querySelectorAll(".deck-key-blank")];
const cellOf = (slot: number) => grid().querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
const scene = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

const HIDDEN_ACTIONS: Action[] = [{ type: "captions.clear" }, { type: "voice.repeat" }, { type: "voice.stop" }];
// A 4 x 3 Voice board: two phrases, three stored commands Voice no longer draws (slots 2 to 4), then Water on slot 8.
const withStoredCommands = (): Board =>
  makeBoard(
    "talk",
    "Talk",
    "voice",
    [speakKey(0, "Hello"), speakKey(1, "Thanks"), ...HIDDEN_ACTIONS.map((action, index): Key => ({ slot: 2 + index, action })), speakKey(8, "Water")],
    { columns: 4, rows: 3 },
  );

async function openDeck(keys: Key[], servedFrom?: string) {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), makeBoard("stream", "Stream", "deck", keys, { columns: 4, rows: 3 })] });
  const remote = renderRemoteApp({ state, servedFrom });
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  await goTo(remote.user, "Deck");
  await screen.findByRole("list", { name: "Keys of Stream" });
  return remote;
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("the + on every empty cell", () => {
  it.each([undefined, TABLET, WIDE])("is drawn on each empty cell of a Voice page, named by its own position (screen %o)", async (size) => {
    if (size) setScreen(size);
    renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One"), speakKey(3, "Two")])] });
    await screen.findByRole("button", { name: "One" });
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(15);
    expect(addPositions()).toEqual([2, 3, ...range(5, 15)]);
    expect(blanks()).toHaveLength(0);
  });

  it("is drawn on each empty cell of the Deck on the computer", async () => {
    setScreen(WIDE);
    await openDeck([scene(0, "Intro"), scene(5, "Talk")], "localhost");
    expect(addPositions()).toEqual([2, 3, 4, 5, ...range(7, 12)]);
    expect(blanks()).toHaveLength(0);
  });

  it("opens the add flow for the cell that was pressed, and the new key lands on it", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One")])] });
    await screen.findByRole("button", { name: "One" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 9" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 9" })).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cellOf(8)).toContainElement(within(grid()).getByRole("button", { name: "Next page" }));
    expect(addPositions()).toEqual([...range(2, 8), ...range(10, 15)]);
  });

  it("offers every cell of a blank new page", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "One")])] });
    await screen.findByRole("button", { name: "One" });
    await user.click(screen.getByRole("button", { name: "New page" }));
    expect(addPositions()).toEqual(range(16, 30));
  });

  it("is not drawn on a full page", async () => {
    renderLocalApp({ boards: [boardOf("main", "Main", range(0, 14).map((slot) => speakKey(slot, `K${slot}`)))] });
    await screen.findByRole("button", { name: "K0" });
    expect(addPositions()).toEqual([]);
    expect(blanks()).toHaveLength(0);
  });

  it.each([PHONE_SIDEWAYS, TABLET])("leaves the slot of a stored key Voice does not draw blank at $width x $height, so adding never overwrites it", async (size) => {
    setScreen(size);
    renderLocalApp({ boards: [withStoredCommands()] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    expect(addPositions()).toEqual([6, 7, 8, 10, 11, 12]);
    expect(blanks().map((blank) => blank.closest("[data-slot]")?.getAttribute("data-slot"))).toEqual(["2", "3", "4"]);
    for (const slot of [2, 3, 4]) expect(within(cellOf(slot)).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([PHONE_SIDEWAYS, TABLET])("is not drawn where the Deck cannot be edited (a phone, $width x $height)", async (size) => {
    setScreen(size);
    await openDeck([scene(0, "Intro"), scene(5, "Talk")], "192.168.1.20");
    expect(addPositions()).toEqual([]);
    // The tablet keeps the page's empty places as inert blanks; the phone drops them.
    expect(blanks()).toHaveLength(size === TABLET ? 10 : 0);
  });

  it("is not drawn while the Deck plays on a phone, where empty cells are dropped; editing brings one per empty cell", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openDeck([scene(0, "Intro"), scene(5, "Talk")], "localhost");
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(2);
    expect(addPositions()).toEqual([]);
    expect(blanks()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Edit keys" }));
    expect(addPositions()).toEqual([2, 3, 4, 5, ...range(7, 12)]);
  });

  it("is drawn while Voice plays on a phone, where the page keeps its whole grid, and adds on the cell pressed", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = renderLocalApp({ boards: [makeBoard("talk", "Talk", "voice", [speakKey(0, "Hello"), speakKey(5, "Water")], { columns: 4, rows: 3 })] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    expect(screen.getByRole("button", { name: "Edit keys" })).toHaveAttribute("aria-pressed", "false");
    expect(addPositions()).toEqual([2, 3, 4, 5, ...range(7, 12)]);
    expect(blanks()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Add a key at position 4" }));
    expect(screen.getByRole("dialog", { name: "Add key 4" })).toBeInTheDocument();
  });
});

describe("a key dragged with a mouse", () => {
  it("can be dropped on any +: the cell is marked while the key is over it, and the key moves there", async () => {
    setScreen(WIDE);
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const { requests } = renderRemoteApp({ state });
    const source = await screen.findByRole("button", { name: "A" });
    const target = screen.getByRole("button", { name: "Add a key at position 12" });
    // jsdom has no DataTransfer: one stand-in carries the slot from the drag start to the drop.
    const data = new Map<string, string>();
    const dataTransfer = { setData: (type: string, value: string) => void data.set(type, value), getData: (type: string) => data.get(type) ?? "", effectAllowed: "all", dropEffect: "none" };
    fireEvent(source, Object.assign(createEvent.dragStart(source), { dataTransfer }));
    fireEvent(target, Object.assign(createEvent.dragOver(target), { dataTransfer }));
    expect(target).toHaveClass("deck-key-drop");
    fireEvent(target, Object.assign(createEvent.drop(target), { dataTransfer }));
    await waitFor(() => expect(cellOf(11)).toContainElement(within(grid()).getByRole("button", { name: "A" })));
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/main/keys/move", body: { from: 0, to: 11 } });
    expect(screen.getByRole("button", { name: "Add a key at position 1" })).not.toHaveClass("deck-key-drop");
  });
});

describe("the slot an Add key control outside the grid targets", () => {
  const navigationOf = (board: Board, page = 0): BoardNavigation => ({ board, position: { boardId: board.id, page }, go: vi.fn(), navigate: vi.fn() });

  function renderPlayer(board: Board, page = 0) {
    const onAddSlotChange = vi.fn();
    render(
      <I18nProvider language="en">
        <BoardPlayer
          navigation={navigationOf(board, page)}
          context={{ isConnected: false, obs: null, captionsVisible: null, voiceLanguage: "en", boards: [board] }}
          onRun={vi.fn()}
          onEditKey={vi.fn()}
          onAddSlotChange={onAddSlotChange}
        />
      </I18nProvider>,
    );
    return onAddSlotChange;
  }

  it("is the first empty cell drawn on the page, not the one after the last key", () => {
    const onAddSlotChange = renderPlayer(boardOf("main", "Main", [speakKey(0, "One"), speakKey(3, "Two")]));
    expect(onAddSlotChange).toHaveBeenLastCalledWith(1);
  });

  it("skips the slot of a stored key that is not drawn", () => {
    const board = makeBoard("talk", "Talk", "voice", [{ slot: 0, action: { type: "voice.stop" } }, speakKey(1, "Hello")], { columns: 4, rows: 3 });
    expect(renderPlayer(board)).toHaveBeenLastCalledWith(2);
  });

  it("is on the page on screen", () => {
    const onAddSlotChange = renderPlayer(boardOf("main", "Main", [speakKey(0, "One"), speakKey(15, "Next"), speakKey(16, "After")]), 1);
    expect(onAddSlotChange).toHaveBeenLastCalledWith(17);
  });

  it("is none when the page is full", () => {
    const onAddSlotChange = renderPlayer(boardOf("main", "Main", range(0, 14).map((slot) => speakKey(slot, `K${slot}`))));
    expect(onAddSlotChange).toHaveBeenLastCalledWith(null);
  });
});

describe("the layout of the page of keys", () => {
  const voice = () => [boardOf("main", "Main", [speakKey(0, "Hello")]), boardOf("stream", "Stream", [scene(0, "Intro")], "deck")];

  it.each([TABLET, WIDE])("fills its area in the Voice workspace at $width x $height", async (size) => {
    setScreen(size);
    renderLocalApp({ boards: voice() });
    await screen.findByRole("button", { name: "Hello" });
    expect(grid()).toHaveAttribute("data-layout", "fill");
    expect(grid().closest("section")).toHaveClass("deck-fill");
  });

  it("stays the largest squares that fit on the Deck", async () => {
    setScreen(WIDE);
    const { user } = renderLocalApp({ boards: voice() });
    await screen.findByRole("button", { name: "Hello" });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Intro" });
    expect(grid()).not.toHaveAttribute("data-layout");
    expect(grid().closest("section")).not.toHaveClass("deck-fill");
  });

  it.each([
    { name: "a narrow window", size: { width: 640, height: 560 }, layout: null },
    { name: "a phone", size: PHONE_SIDEWAYS, layout: "whole" },
    { name: "a wide but short window", size: { width: 1200, height: 500 }, layout: null },
  ])("keeps the Voice layout of $name", async ({ size, layout }) => {
    setScreen(size);
    renderLocalApp({ boards: voice() });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    if (layout) expect(grid()).toHaveAttribute("data-layout", layout);
    else expect(grid()).not.toHaveAttribute("data-layout");
    expect(grid().closest("section")).not.toHaveClass("deck-fill");
  });
});
