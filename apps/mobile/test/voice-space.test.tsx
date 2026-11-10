import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, renderLocalApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const iconOf = (key: HTMLElement) => key.querySelector("svg.key-icon");
const composerText = () => screen.getByRole("textbox", { name: "Text to speak" });
const recent = () => screen.getByRole("region", { name: "Recent phrases" });
const recentTexts = () => within(recent()).getAllByRole("listitem").map((item) => item.textContent);

describe("Voice keys", () => {
  it("show a phrase as text only unless the person chose an icon for it", async () => {
    renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello"), speakKey(1, "Water", { icon: "water" })])] });
    expect(iconOf(await screen.findByRole("button", { name: "Hello" }))).toBeNull();
    expect(iconOf(screen.getByRole("button", { name: "Water" }))).not.toBeNull();
  });

  it("keep the action icon on command and navigation keys", async () => {
    const keys = [speakKey(0, "Hello"), { slot: 1, action: { type: "voice.stop" as const } }, { slot: 2, action: { type: "nav.goToPage" as const, page: 2 } }];
    renderLocalApp({ boards: [boardOf("main", "Main", keys)] });
    expect(iconOf(await screen.findByRole("button", { name: "Stop voice" }))).not.toBeNull();
    expect(iconOf(screen.getByRole("button", { name: "Page 2" }))).not.toBeNull();
  });

  it("mark the key being spoken until speech ends", async () => {
    const { synthesizer } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hello"), speakKey(1, "Bye")])] });
    let finish = () => {};
    synthesizer.speak = () => new Promise<void>((resolve) => (finish = resolve));
    const hello = await screen.findByRole("button", { name: "Hello" });
    fireEvent.click(hello);
    expect(hello).toHaveAccessibleDescription("Speaking");
    expect(screen.getByRole("button", { name: "Bye" })).not.toHaveAccessibleDescription("Speaking");
    await act(async () => finish());
    expect(hello).not.toHaveAccessibleDescription("Speaking");
  });
});

describe("Voice composer", () => {
  it("starts two lines tall and keeps its actions reachable by name", () => {
    renderLocalApp();
    expect(composerText()).toHaveAttribute("rows", "2");
    for (const name of ["Speak", "Stop", "Save as key"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("speaks on Enter, adds a line on Shift+Enter and waits while an IME is composing", async () => {
    const { synthesizer, user } = renderLocalApp();
    await user.type(composerText(), "Line one{Shift>}{Enter}{/Shift}Line two");
    fireEvent.keyDown(composerText(), { key: "Enter", isComposing: true });
    expect(synthesizer.texts).toEqual([]);
    await user.keyboard("{Enter}");
    expect(synthesizer.texts).toEqual(["Line one\nLine two"]);
    expect(composerText()).toHaveValue("Line one\nLine two");
  });
});

describe("Recent phrases", () => {
  it("are hidden until something is spoken from the composer", async () => {
    const { user } = renderLocalApp();
    expect(screen.queryByRole("region", { name: "Recent phrases" })).not.toBeInTheDocument();
    await user.type(composerText(), "Good morning{Enter}");
    expect(recentTexts()).toEqual(["Good morning"]);
  });

  it("list the latest first and speak one again when tapped", async () => {
    const { synthesizer, user } = renderLocalApp();
    await user.type(composerText(), "First{Enter}");
    await user.clear(composerText());
    await user.type(composerText(), "Second");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(recentTexts()).toEqual(["Second", "First"]);

    fireEvent.click(within(recent()).getByRole("button", { name: "First" }));
    expect(synthesizer.texts).toEqual(["First", "Second", "First"]);
    // Tapping a chip keeps the row where it is, so a chip never moves under the finger.
    expect(recentTexts()).toEqual(["Second", "First"]);
  });

  it("do not include phrases spoken from board keys or empty text", async () => {
    const { user } = renderLocalApp();
    await user.click(await screen.findByRole("button", { name: "Hello" }));
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(screen.queryByRole("region", { name: "Recent phrases" })).not.toBeInTheDocument();
  });

  it("stay on this device across visits and can be cleared", async () => {
    const { user, view } = renderLocalApp();
    await user.type(composerText(), "Remember me{Enter}");
    view.unmount();

    const again = renderLocalApp();
    expect(recentTexts()).toEqual(["Remember me"]);
    await again.user.click(screen.getByRole("button", { name: "Clear recent phrases" }));
    expect(screen.queryByRole("region", { name: "Recent phrases" })).not.toBeInTheDocument();
    expect(composerText()).toHaveFocus();
  });

  it("belong to the Voice space only", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("main", "Main", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [], "deck")] });
    await user.type(composerText(), "Hi there{Enter}");
    await goTo(user, "Deck");
    expect(screen.queryByRole("region", { name: "Recent phrases" })).not.toBeInTheDocument();
  });
});
