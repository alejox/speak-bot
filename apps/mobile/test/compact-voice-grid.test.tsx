import { makeBoard, type Board } from "@speed-deck/core";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderLocalApp, setScreen, speakKey } from "./app-fakes";

/*
 * W8: the Voice board on a phone plays on exactly the grid it is edited on (WYSIWYG). The same columns ×
 * rows, the same cell for every key, empty cells kept as blank space; only the editing tools go away.
 */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const PHONE_UPRIGHT = { width: 412, height: 915 };

// A 6 x 4 board (4 x 6 upright) holding nine phrases, with gaps between some of them.
const SLOTS = [0, 1, 2, 4, 7, 9, 13, 18, 22];
const talk = (): Board =>
  makeBoard(
    "talk",
    "Talk",
    "voice",
    SLOTS.map((slot) => speakKey(slot, `Phrase ${slot}`)),
    { columns: 6, rows: 4 },
  );
const grid = () => screen.getByRole("list", { name: "Keys of Talk" });
/** The names of the keys on the page, without the + of its empty cells. */
const phraseKeys = () =>
  within(grid())
    .getAllByRole("button")
    .map((key) => key.getAttribute("aria-label") ?? key.textContent ?? "")
    .filter((name) => !name.startsWith("Add a key"));

/** What decides where every cell lands: the grid's columns and rows and each cell's slot and placement, in drawn order. */
function geometry() {
  const list = grid();
  return {
    columns: list.style.getPropertyValue("--grid-columns"),
    rows: list.style.getPropertyValue("--grid-rows"),
    layout: list.getAttribute("data-layout"),
    cells: within(list)
      .getAllByRole("listitem", { hidden: true })
      .map((cell) => ({
        slot: cell.getAttribute("data-slot"),
        row: cell.style.getPropertyValue("--cell-row"),
        column: cell.style.getPropertyValue("--cell-column"),
      })),
  };
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("the Voice grid on a phone", () => {
  it.each([
    { size: PHONE_SIDEWAYS, columns: "6", rows: "4" },
    { size: PHONE_UPRIGHT, columns: "4", rows: "6" },
  ])("plays on the same grid it is edited on at $size.width x $size.height", async ({ size, columns, rows }) => {
    setScreen(size);
    const { user } = renderLocalApp({ boards: [talk()] });
    await screen.findByRole("button", { name: "Phrase 0" }, { timeout: 5000 });

    const playing = geometry();
    expect(playing.columns).toBe(columns);
    expect(playing.rows).toBe(rows);
    // Every cell of the page is there, empty ones as blank space.
    expect(playing.cells).toHaveLength(24);

    await user.click(screen.getByRole("button", { name: "Edit keys" }));
    const editing = geometry();
    expect(playing).toEqual(editing);
  });

  it("draws every empty cell as a + while playing, each on its own cell, and the phrases stay where they are", async () => {
    setScreen(PHONE_SIDEWAYS);
    renderLocalApp({ boards: [talk()] });
    await screen.findByRole("button", { name: "Phrase 0" }, { timeout: 5000 });
    const adds = within(grid()).getAllByRole("button", { name: /^Add a key/ });
    expect(adds).toHaveLength(24 - SLOTS.length);
    for (const add of adds) expect(add.closest("[data-slot]")).toHaveAttribute("data-slot", String(Number(add.getAttribute("aria-label")!.replace(/\D+/g, "")) - 1));
    expect(phraseKeys()).toEqual(SLOTS.map((slot) => `Phrase ${slot}`));
    for (const slot of SLOTS) expect(grid().querySelector(`[data-slot="${slot}"]`)).toContainElement(screen.getByRole("button", { name: `Phrase ${slot}` }));
    // No cell is left as inert blank space: this board stores no key that Voice hides.
    expect(grid().querySelectorAll(".deck-key-blank")).toHaveLength(0);
  });

  it("keeps each key on its own cell upright, turned the way the Deck turns its board", async () => {
    setScreen(PHONE_UPRIGHT);
    renderLocalApp({ boards: [talk()] });
    await screen.findByRole("button", { name: "Phrase 0" }, { timeout: 5000 });
    // Drawn column by column of the stored board: slot 0, 6, 12, 18, then 1, 7, ...
    expect(geometry().cells.slice(0, 5).map((cell) => cell.slot)).toEqual(["0", "6", "12", "18", "1"]);
  });
});
