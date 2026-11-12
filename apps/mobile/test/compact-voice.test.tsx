import { makeBoard, type Board } from "@speed-deck/core";
import { act, fireEvent, screen, within } from "@testing-library/react";
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
    // W5: the only page's "+" (New page) sits beside Write, never in the top bar.
    expect(within(screen.getByRole("group", { name: "Voice actions" })).getByRole("button", { name: "New page" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New page" })).toHaveLength(1);
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

describe("the composer sheet on a phone", () => {
  const writeButton = () => screen.getByRole("button", { name: "Write" });
  const sheet = () => screen.getByRole("dialog", { name: "Write" });
  const sheetText = () => within(sheet()).getByRole("textbox", { name: "Text to speak" });

  it.each([PHONE_SIDEWAYS, PHONE_SHORT, PHONE_UPRIGHT])("puts the composer away behind one Write button at $width x $height", async (size) => {
    setScreen(size);
    await openVoice();
    expect(screen.queryByRole("textbox", { name: "Text to speak" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Speak" })).not.toBeInTheDocument();
    expect(writeButton()).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a dialog with the text box focused", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice();
    await user.click(writeButton());
    expect(sheetText()).toHaveFocus();
    for (const name of ["Speak", "Stop", "Save as key", "Close"]) expect(within(sheet()).getByRole("button", { name })).toBeInTheDocument();
  });

  it("speaks from the sheet and stays open for the next sentence, remembering it as a recent phrase", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user, synthesizer } = await openVoice();
    await user.click(writeButton());
    await user.type(sheetText(), "Good night");
    await user.click(within(sheet()).getByRole("button", { name: "Speak" }));
    expect(synthesizer.texts).toEqual(["Good night"]);
    await user.type(sheetText(), "{Enter}");
    expect(synthesizer.texts).toEqual(["Good night", "Good night"]);
    expect(sheet()).toBeInTheDocument();
    const recent = within(sheet()).getByRole("region", { name: "Recent phrases" });
    expect(within(recent).getByRole("button", { name: "Good night" })).toBeInTheDocument();
  });

  it("saves the text as a phrase key on the board", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice();
    await user.click(writeButton());
    await user.type(sheetText(), "See you later");
    await user.click(within(sheet()).getByRole("button", { name: "Save as key" }));
    expect(await within(grid()).findByRole("button", { name: "See you later" })).toBeInTheDocument();
  });

  it("offers Stop on screen while speech plays, with the sheet closed", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { synthesizer } = await openVoice();
    let finish = () => {};
    synthesizer.speak = () => new Promise<void>((resolve) => (finish = resolve));
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hello" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(synthesizer.cancelled).toBeGreaterThan(0);
    await act(async () => finish());
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("closes on Escape and gives focus back to the Write button", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await openVoice();
    await user.click(writeButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writeButton()).toHaveFocus();
  });

  it("keeps the inline composer and no Write button on a tablet", async () => {
    setScreen(TABLET);
    await openVoice();
    expect(screen.getByRole("textbox", { name: "Text to speak" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write" })).not.toBeInTheDocument();
  });

  it("names the button Escribir in Spanish", async () => {
    setScreen(PHONE_SIDEWAYS);
    renderLocalApp({ boards: [phrases()], language: "es" });
    expect(await screen.findByRole("button", { name: "Escribir" }, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe("a long phrase on a key", () => {
  const LONG = "Could you please give me a moment, I am still thinking about what I want to say next";

  it("keeps the whole phrase as its name and its tooltip, and says all of it", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { synthesizer } = await openVoice([makeBoard("talk", "Talk", "voice", [speakKey(0, "Hello"), speakKey(1, LONG)], { columns: 4, rows: 3 })]);
    const key = screen.getByRole("button", { name: LONG });
    expect(key).toHaveAttribute("title", LONG);
    fireEvent.click(key);
    expect(synthesizer.texts).toEqual([LONG]);
  });
});
