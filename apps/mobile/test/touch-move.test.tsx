import { makeBoard, type Board } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS } from "../src/components/BoardPlayer";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setScreen, speakKey } from "./app-fakes";

/*
 * Moving a key by touch: a long press, then a drag. jsdom has no layout, so `document.elementFromPoint` is
 * stubbed to say which cell is under the finger. Still manual on a real phone: the page neither scrolls nor
 * selects text while a key is moved, and the lifted key and the target ring are easy to see.
 */
const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const cellOf = (slot: number) => grid().querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
const keyNames = () => within(grid()).getAllByRole("button", { name: /^[AB]$/ }).map((key) => key.textContent);

/** Puts the finger over `element` for the app's hit test. */
function fingerOver(element: Element | null) {
  document.elementFromPoint = () => element;
}

/** Rests a finger on `key` until the long press fires. */
function longPress(key: Element) {
  fireEvent.pointerDown(key, { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 });
  act(() => void vi.advanceTimersByTime(LONG_PRESS_MS + 50));
}

describe("moving a key by touch", () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vibrate.mockClear();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    delete (navigator as { vibrate?: unknown }).vibrate;
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("lifts the key once the finger moves after a long press, marks the cell under it and swaps on release", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A"), speakKey(1, "B")])] });
    const { requests } = renderRemoteApp({ state });
    const a = await screen.findByRole("button", { name: "A" }, { timeout: 5000 });
    longPress(a);
    expect(screen.getByRole("menu", { name: "Key 1: A" })).toBeInTheDocument();

    // A tremble under the threshold keeps the menu.
    fireEvent.pointerMove(a, { pointerType: "touch", pointerId: 1, clientX: 24, clientY: 22 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(a).not.toHaveClass("deck-key-moving");

    const b = screen.getByRole("button", { name: "B" });
    fingerOver(b);
    fireEvent.pointerMove(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 20 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(a).toHaveClass("deck-key-moving");
    expect(b).toHaveClass("deck-key-drop");
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(10);

    fireEvent.pointerUp(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 20 });
    await waitFor(() => expect(keyNames()).toEqual(["B", "A"]));
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/main/keys/move", body: { from: 0, to: 1 } });
    expect(screen.getByRole("button", { name: "A" })).not.toHaveClass("deck-key-moving");
    expect(grid().querySelector(".deck-key-drop")).toBeNull();
  });

  it("moves onto an empty place and neither runs the key nor opens its menu", async () => {
    const { synthesizer } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "A")])] });
    const a = await screen.findByRole("button", { name: "A" }, { timeout: 5000 });
    longPress(a);
    fingerOver(cellOf(7).firstElementChild);
    fireEvent.pointerMove(a, { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 120 });
    expect(cellOf(7).firstElementChild).toHaveClass("deck-key-drop");
    fireEvent.pointerUp(a, { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 120 });
    fireEvent.click(a, { detail: 1 });
    await waitFor(() => expect(within(cellOf(7)).getByRole("button", { name: "A" })).toBeInTheDocument());
    expect(synthesizer.texts).toEqual([]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the menu when the finger lifts without moving", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A"), speakKey(1, "B")])] });
    const { requests } = renderRemoteApp({ state });
    const a = await screen.findByRole("button", { name: "A" }, { timeout: 5000 });
    longPress(a);
    fireEvent.pointerUp(a, { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.click(a, { detail: 1 });
    expect(screen.getByRole("menu", { name: "Key 1: A" })).toBeInTheDocument();
    expect(requests.some((request) => request.url.endsWith("/keys/move"))).toBe(false);
  });

  it.each(["leaves the grid", "is cancelled"])("drops the move when the touch %s", async (how) => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "A"), speakKey(1, "B")])] });
    const { requests } = renderRemoteApp({ state });
    const a = await screen.findByRole("button", { name: "A" }, { timeout: 5000 });
    longPress(a);
    fingerOver(screen.getByRole("button", { name: "B" }));
    fireEvent.pointerMove(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 20 });
    expect(a).toHaveClass("deck-key-moving");
    if (how === "is cancelled") fireEvent.pointerCancel(a, { pointerType: "touch", pointerId: 1 });
    else {
      fingerOver(document.body);
      fireEvent.pointerMove(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 900 });
    }
    expect(a).not.toHaveClass("deck-key-moving");
    expect(grid().querySelector(".deck-key-drop")).toBeNull();
    fingerOver(screen.getByRole("button", { name: "B" }));
    fireEvent.pointerUp(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 20 });
    expect(keyNames()).toEqual(["A", "B"]);
    expect(requests.some((request) => request.url.endsWith("/keys/move"))).toBe(false);
  });

  it("drops on the real slot of a transposed cell", async () => {
    setScreen({ width: 390, height: 844 });
    const board: Board = makeBoard("main", "Main", "voice", [speakKey(0, "A")], { columns: 6, rows: 4 });
    const { requests } = renderRemoteApp({ state: desktopState({ boards: [board] }) });
    const a = await screen.findByRole("button", { name: "A" }, { timeout: 5000 });
    // Drawn second (first row, second column): the first cell of the stored second row.
    const second = within(grid()).getAllByRole("listitem")[1]!;
    expect(second).toHaveAttribute("data-slot", "6");
    longPress(a);
    fingerOver(second.firstElementChild);
    fireEvent.pointerMove(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 20 });
    fireEvent.pointerUp(a, { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 20 });
    await waitFor(() => expect(requests).toContainEqual({ method: "POST", url: "/api/boards/main/keys/move", body: { from: 0, to: 6 } }));
  });
});
