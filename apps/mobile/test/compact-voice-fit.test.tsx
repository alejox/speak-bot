import { makeBoard, type Board } from "@speed-deck/core";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderLocalApp, setScreen, speakKey } from "./app-fakes";

/*
 * W5: the Voice space on a phone gives its room to the keys. No board pill (a small icon button only when
 * there are several boards), keys reflowed to the largest size while playing, and the pager beside Write.
 */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const PHONE_UPRIGHT = { width: 412, height: 915 };
const TABLET = { width: 1024, height: 768 };

// A 3 x 4 board, the second page holding one more phrase.
const talk = (): Board =>
  makeBoard("talk", "Talk", "voice", [speakKey(0, "Hello"), speakKey(1, "Thanks"), speakKey(5, "Water"), speakKey(12, "Later")], { columns: 3, rows: 4 });
const other = (): Board => makeBoard("other", "Other", "voice", [speakKey(0, "Bye")], { columns: 3, rows: 4 });
const grid = () => screen.getByRole("list", { name: "Keys of Talk" });
const button = (name: string) => screen.queryByRole("button", { name });

async function openVoice(boards: Board[] = [talk()]) {
  const app = renderLocalApp({ boards });
  await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
  return app;
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("the board switch on a phone", () => {
  it.each([PHONE_SIDEWAYS, PHONE_UPRIGHT])("shows no board picker with a single Voice board at $width x $height", async (size) => {
    setScreen(size);
    await openVoice();
    expect(button("Board: Talk")).not.toBeInTheDocument();
    expect(button("Boards")).not.toBeInTheDocument();
  });

  it("offers a small Boards button that opens the board menu with two Voice boards", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice([talk(), other()]);
    expect(button("Board: Talk")).not.toBeInTheDocument();
    await user.click(button("Boards")!);
    const menu = screen.getByRole("menu", { name: "Boards" });
    await user.click(within(menu).getByRole("menuitemradio", { name: "Other" }));
    expect(await screen.findByRole("button", { name: "Bye" })).toBeInTheDocument();
  });

  it("keeps the board pill on a tablet", async () => {
    setScreen(TABLET);
    await openVoice();
    expect(button("Board: Talk")).toBeInTheDocument();
    expect(button("Boards")).not.toBeInTheDocument();
  });
});

describe("the phrase keys on a phone", () => {
  it("are laid out to fit while playing, in reading order", async () => {
    setScreen(PHONE_SIDEWAYS);
    await openVoice();
    expect(grid()).toHaveAttribute("data-layout", "fit");
    expect(within(grid()).getAllByRole("button").map((key) => key.getAttribute("aria-label") ?? key.textContent)).toEqual(["Hello", "Thanks", "Water"]);
  });

  it("keep the board's real grid positions while editing", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice();
    await user.click(button("Edit keys")!);
    expect(grid()).not.toHaveAttribute("data-layout", "fit");
    // Every cell of the 3 x 4 page is drawn, empty ones included.
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(12);
  });

  it("keep the tablet layout as stored", async () => {
    setScreen(TABLET);
    await openVoice();
    expect(grid()).not.toHaveAttribute("data-layout", "fit");
  });
});

describe("the pager beside Write on a phone", () => {
  const actions = () => screen.getByRole("group", { name: "Voice actions" });

  it("moves out of the top bar into the actions, next to Write", async () => {
    setScreen(PHONE_SIDEWAYS);
    await openVoice();
    const next = within(actions()).getByRole("button", { name: "Next page" });
    const write = within(actions()).getByRole("button", { name: "Write" });
    // Directly before Write.
    expect(next.nextElementSibling).toBe(write);
    expect(screen.getAllByRole("button", { name: "Next page" })).toHaveLength(1);
  });

  it("goes to the next page, then back, and offers a new page on the last one", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice();
    expect(within(actions()).queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    await user.click(within(actions()).getByRole("button", { name: "Next page" }));
    expect(await screen.findByRole("button", { name: "Later" })).toBeInTheDocument();
    expect(within(actions()).queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    expect(within(actions()).getByRole("button", { name: "New page" })).toBeInTheDocument();
    await user.click(within(actions()).getByRole("button", { name: "Previous page" }));
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
  });

  it("opens a new empty page ready for its first phrase", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice([makeBoard("talk", "Talk", "voice", [speakKey(0, "Hello")], { columns: 3, rows: 4 })]);
    await user.click(within(actions()).getByRole("button", { name: "New page" }));
    expect(button("Edit keys")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Hello" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add a key/ })).toBeInTheDocument();
    // Back to the first page from the new one.
    await user.click(within(actions()).getByRole("button", { name: "Previous page" }));
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
  });

  it("names the buttons in Spanish", async () => {
    setScreen(PHONE_SIDEWAYS);
    renderLocalApp({ boards: [talk()], language: "es" });
    expect(await screen.findByRole("button", { name: "Página siguiente" }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("keeps the tablet pager in the top bar", async () => {
    setScreen(TABLET);
    await openVoice();
    expect(screen.queryByRole("group", { name: "Voice actions" })).not.toBeInTheDocument();
    expect(button("Next page")).toBeInTheDocument();
  });
});
