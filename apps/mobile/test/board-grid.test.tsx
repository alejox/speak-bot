import { makeBoard, type Board, type BoardGrid } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { findBoardPill } from "./board-picker";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const voiceBoard = (slots: number[], size?: BoardGrid): Board =>
  makeBoard("talk", "Talk", "voice", slots.map((slot) => speakKey(slot, `K${slot}`)), size);

async function openGridDialog(user: { click: (element: Element) => Promise<void> }) {
  await findBoardPill();
  await user.click(screen.getByRole("button", { name: "Grid size" }));
  return screen.getByRole("dialog", { name: "Grid size" });
}

describe("grid size", () => {
  it("opens a dialog from the grid button beside the board pill, starting at the current size", async () => {
    const { user } = renderLocalApp({ boards: [voiceBoard([0])] });
    const dialog = await openGridDialog(user);
    expect(within(dialog).getByRole("combobox", { name: "Columns" })).toHaveDisplayValue("5");
    expect(within(dialog).getByRole("combobox", { name: "Rows" })).toHaveDisplayValue("3");
    expect(within(dialog).getAllByRole("option", { name: /^\d$/ }).map((option) => option.textContent)).toEqual(["3", "4", "5", "6", "7", "8", "2", "3", "4", "5"]);
    expect(dialog).toHaveTextContent("Applies to all boards. Keys keep their place when they fit.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows 24 keys per page after choosing 6 × 4, keeping keys in place", async () => {
    const { user } = renderLocalApp({ boards: [voiceBoard([0, 7])] });
    const dialog = await openGridDialog(user);
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Columns" }), "6");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Rows" }), "4");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(24);
    // The page keeps the board's proportions at every width: the CSS lays out exactly these columns and rows.
    expect(grid().style.getPropertyValue("--grid-columns")).toBe("6");
    expect(grid().style.getPropertyValue("--grid-rows")).toBe("4");
    // Row 1, column 2 of 5 × 3 is slot 8 of 6 × 4: the + after it is position 10.
    expect(within(grid()).getByRole("button", { name: "Add a key at position 10" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Grid set to 6 × 4.");
  });

  it("offers the + by the board's page size", async () => {
    const { user } = renderLocalApp({ boards: [voiceBoard([0, 24], { columns: 6, rows: 4 })] });
    await findBoardPill();
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(24);
    expect(within(grid()).getByRole("button", { name: "Add a key at position 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(within(grid()).getByRole("button", { name: "Add a key at position 26" })).toBeInTheDocument();
  });

  it("asks the desktop to resize every board and shows a refusal in the dialog", async () => {
    const state = desktopState({ boards: [voiceBoard([0])] });
    const { requests, user } = renderRemoteApp({ state });
    const dialog = await openGridDialog(user);
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Columns" }), "3");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Rows" }), "2");
    state.gridFull = true;
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests).toContainEqual({ method: "PUT", url: "/api/boards/grid", body: { columns: 3, rows: 2 } }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("The keys do not fit in that grid. Choose a larger size or remove keys.");
    expect(screen.getByRole("dialog", { name: "Grid size" })).toBeInTheDocument();

    state.gridFull = false;
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(6);
  });
});
