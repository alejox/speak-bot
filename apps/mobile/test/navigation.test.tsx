import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { NAV_COLLAPSED_STORAGE_KEY, SECTION_STORAGE_KEY } from "../src/app/use-section";
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

  it("collapses the menu to icons, keeping names, and remembers it", async () => {
    const { user, view, services } = renderLocalApp();
    const toggle = screen.getByRole("button", { name: "Collapse menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const board = within(nav).getByRole("link", { name: "Board" });
    expect(board).toHaveAttribute("title", "Board");
    expect(board).toHaveAttribute("aria-current", "page");
    expect(JSON.parse(localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) ?? "null")).toBe(true);

    view.unmount();
    render(<App services={services} />);
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
