import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boardOf, renderLocalApp, setWideScreen, speakKey } from "./app-fakes";

const boards = () => [boardOf("main", "Main", [speakKey(0, "Hello")])];
const field = () => screen.getByRole("textbox", { name: "Text to speak" });
const clearButton = () => screen.queryByRole("button", { name: "Clear text" });

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe.each([
  ["narrow", false],
  ["wide", true],
])("clearing the composer on a %s screen", (_name, wide) => {
  it("offers Clear text only while there is text, empties the field in one tap and returns focus to it", async () => {
    setWideScreen(wide);
    const { user, synthesizer } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    expect(clearButton()).not.toBeInTheDocument();

    await user.type(field(), "Good morning");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    const recent = screen.getByRole("region", { name: "Recent phrases" });
    expect(within(recent).getByRole("button", { name: "Good morning" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear text" }));
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(clearButton()).not.toBeInTheDocument();
    // Nothing more was said, and what was said before is still offered.
    expect(synthesizer.texts).toEqual(["Good morning"]);
    expect(within(screen.getByRole("region", { name: "Recent phrases" })).getByRole("button", { name: "Good morning" })).toBeInTheDocument();
  });
});

describe("clearing the composer in Spanish", () => {
  it("names the button Borrar texto", async () => {
    const { user } = renderLocalApp({ boards: boards(), language: "es" });
    await user.type(await screen.findByRole("textbox", { name: "Texto para decir" }), "Hola");
    expect(screen.getByRole("button", { name: "Borrar texto" })).toBeInTheDocument();
  });
});
