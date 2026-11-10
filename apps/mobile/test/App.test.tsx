import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderLocalApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

describe("App composer", () => {
  it("speaks the typed text when Speak is pressed", async () => {
    const { synthesizer, user } = renderLocalApp({ settings: { voiceId: "alex", rate: 1.3 } });
    await goTo(user, "Speak");
    await user.type(screen.getByLabelText("Text to speak"), "Hello world");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(synthesizer.spoken).toEqual([{ text: "Hello world", options: { voiceId: "alex", rate: 1.3 } }]);
  });

  it("speaks on Enter and inserts a new line on Shift+Enter", async () => {
    const { synthesizer, user } = renderLocalApp();
    await goTo(user, "Speak");
    await user.type(screen.getByLabelText("Text to speak"), "Line one{Shift>}{Enter}{/Shift}Line two{Enter}");
    expect(synthesizer.texts).toEqual(["Line one\nLine two"]);
  });

  it("asks for text instead of speaking when empty", async () => {
    const { synthesizer, user } = renderLocalApp();
    await goTo(user, "Speak");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(await screen.findByText("Type something to speak first.")).toBeInTheDocument();
    expect(synthesizer.spoken).toEqual([]);
  });

  it("persists the selected voice and rate", async () => {
    const { user, getSettings } = renderLocalApp();
    await goTo(user, "Settings");
    await screen.findByRole("option", { name: "Alex (en-US)" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Voice" }), "alex");
    expect(getSettings()).toEqual({ voiceId: "alex", rate: 1 });
  });
});
