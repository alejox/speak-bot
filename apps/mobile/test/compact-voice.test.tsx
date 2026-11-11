import { makeBoard, type Board } from "@speed-deck/core";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boardOf, renderLocalApp, setScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

/*
 * The Voice space on a phone (short or narrow window): the phrase keys first, editing behind the Edit keys
 * toggle like the Deck. jsdom cannot measure layout. Still manual, at 915x412, 800x360, 412x915 and
 * 1024x768: every key of a 4 x 3 board shows without scrolling.
 */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const PHONE_SHORT = { width: 800, height: 360 };
const PHONE_UPRIGHT = { width: 412, height: 915 };
const TABLET = { width: 1024, height: 768 };

const phrases = (): Board =>
  makeBoard("talk", "Talk", "voice", [speakKey(0, "Hello"), speakKey(1, "Thanks"), speakKey(5, "Water")], { columns: 4, rows: 3 });
const grid = () => screen.getByRole("list", { name: "Keys of Talk" });
const editToggle = () => screen.queryByRole("button", { name: "Edit keys" });

async function openVoice(boards: Board[] = [phrases()]) {
  const app = renderLocalApp({ boards });
  await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
  return app;
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("the Voice space on a phone, while playing", () => {
  it.each([PHONE_SIDEWAYS, PHONE_SHORT, PHONE_UPRIGHT])("shows only the phrase keys and the quick phrases at $width x $height", async (size) => {
    setScreen(size);
    await openVoice();
    expect(editToggle()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Grid size" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add a key/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Options for key/ })).not.toBeInTheDocument();
    // No empty slots: only the three keys are drawn.
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "Quick phrases" })).toBeInTheDocument();
  });

  it("still speaks a phrase key with one tap", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { synthesizer } = await openVoice();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    expect(synthesizer.texts).toEqual(["Water"]);
  });

  it("reaches the editing tools through the Edit keys toggle", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice();
    await user.click(editToggle()!);
    expect(editToggle()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add a key/ })).toBeInTheDocument();
    await user.click(editToggle()!);
    expect(screen.queryByRole("button", { name: "Grid size" })).not.toBeInTheDocument();
  });

  it("keeps editing in one space apart from the other", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice([phrases(), boardOf("stream", "Stream", [], "deck")]);
    await user.click(editToggle()!);
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Board: Stream" });
    expect(editToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the tablet layout as it was: no toggle, editing always at hand", async () => {
    setScreen(TABLET);
    await openVoice();
    expect(editToggle()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add a key/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Text to speak" })).toBeInTheDocument();
  });
});
