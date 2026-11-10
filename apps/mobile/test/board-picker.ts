import { fireEvent, screen } from "@testing-library/react";

type User = { click: (element: Element) => Promise<void> };

/** The board pill at the top of the deck; its name is "<label>: <board name>". */
export const boardPill = (label = "Board") => screen.getByRole("button", { name: new RegExp(`^${label}: `) });

/** The board pill, once the boards have loaded. */
export const findBoardPill = (label = "Board") => screen.findByRole("button", { name: new RegExp(`^${label}: `) });

/** Opens the board menu from the pill and picks the board `name`. */
export async function chooseBoard(user: User, name: string, label = "Board") {
  await user.click(boardPill(label));
  await user.click(screen.getByRole("menuitemradio", { name }));
}

/** The boards the board menu offers, in order; closes the menu again. */
export async function offeredBoards(user: User, label = "Board") {
  await user.click(boardPill(label));
  const names = screen.getAllByRole("menuitemradio").map((item) => item.textContent);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  return names;
}
