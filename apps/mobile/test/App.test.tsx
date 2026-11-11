import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderLocalApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

describe("App composer", () => {
  it("is on the Voice screen, above the voice board, with no separate Speak section", async () => {
    renderLocalApp();
    const composer = screen.getByRole("region", { name: "Type to speak" });
    const key = await screen.findByRole("button", { name: "Hello" });
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toBeInTheDocument();
    expect(composer.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Speak" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quick keys" })).not.toBeInTheDocument();
  });

  it("speaks the typed text when Speak is pressed", async () => {
    const { synthesizer, user } = renderLocalApp({ settings: { voiceId: "alex", rate: 1.3 } });
    await user.type(screen.getByLabelText("Text to speak"), "Hello world");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(synthesizer.spoken).toEqual([{ text: "Hello world", options: { voiceId: "alex", rate: 1.3, mode: "queue" } }]);
  });

  it("speaks on Enter and inserts a new line on Shift+Enter", async () => {
    const { synthesizer, user } = renderLocalApp();
    await user.type(screen.getByLabelText("Text to speak"), "Line one{Shift>}{Enter}{/Shift}Line two{Enter}");
    expect(synthesizer.texts).toEqual(["Line one\nLine two"]);
  });

  it("asks for text instead of speaking when empty", async () => {
    const { synthesizer, user } = renderLocalApp();
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(await screen.findByText("Type something to speak first.")).toBeInTheDocument();
    expect(synthesizer.spoken).toEqual([]);
  });

  it("persists the selected voice and rate", async () => {
    const { user, getSettings } = renderLocalApp();
    await goTo(user, "Settings");
    await screen.findByRole("option", { name: "Alex · English (United States)" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Voice" }), "alex");
    expect(getSettings()).toEqual({ voiceId: "alex", rate: 1 });
  });
});
