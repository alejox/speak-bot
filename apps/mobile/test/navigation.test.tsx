import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { NAV_COLLAPSED_STORAGE_KEY, SECTION_STORAGE_KEY } from "../src/app/use-section";
import { renderLocalApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

describe("navigation", () => {
  it("starts in Voice and switches sections, marking the current one", async () => {
    const { user } = renderLocalApp();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Voice", "Deck", "Settings"]);
    expect(within(nav).getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByLabelText("Text to speak")).toBeInTheDocument();

    await goTo(user, "Deck");
    expect(within(nav).getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Voice" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).toHaveFocus();
    expect(screen.queryByLabelText("Text to speak")).not.toBeInTheDocument();
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

  it.each(["board", "speak", "phrases"])("opens Voice when an older version remembered the %s section", (stored) => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(stored));
    renderLocalApp();
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toBeInTheDocument();
  });

  it("remembers the Deck space", () => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify("deck"));
    renderLocalApp();
    expect(screen.getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
  });

  it("collapses the menu to icons, keeping names, and remembers it", async () => {
    const { user, view, services } = renderLocalApp();
    const toggle = screen.getByRole("button", { name: "Collapse menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const voice = within(nav).getByRole("link", { name: "Voice" });
    expect(voice).toHaveAttribute("title", "Voice");
    expect(voice).toHaveAttribute("aria-current", "page");
    expect(JSON.parse(localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) ?? "null")).toBe(true);

    view.unmount();
    render(<App services={services} />);
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
