import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { SECTION_STORAGE_KEY } from "../src/app/use-section";
import { renderLocalApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

describe("navigation", () => {
  it("starts on the board and switches sections, marking the current one", async () => {
    const { user } = renderLocalApp();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Board", "Speak", "Settings"]);
    expect(within(nav).getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();

    await goTo(user, "Speak");
    expect(within(nav).getByRole("link", { name: "Speak" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Board" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 2, name: "Speak" })).toHaveFocus();
    expect(screen.getByLabelText("Text to speak")).toBeInTheDocument();
  });

  it("works with the keyboard", async () => {
    const { user } = renderLocalApp();
    const settingsLink = screen.getByRole("link", { name: "Settings" });
    settingsLink.focus();
    await user.keyboard("{Enter}");
    expect(settingsLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("combobox", { name: "Voice" })).toBeInTheDocument();
  });

  it("remembers the last section", async () => {
    const { user, view, services } = renderLocalApp();
    await goTo(user, "Settings");
    expect(JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY) ?? "null")).toBe("settings");
    view.unmount();
    render(<App services={services} />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the board when an older version remembered the Phrases section", () => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify("phrases"));
    renderLocalApp();
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
  });

});
