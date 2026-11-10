import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { NAV_COLLAPSED_STORAGE_KEY, SECTION_STORAGE_KEY, SECTIONS } from "../src/app/use-section";
import { renderLocalApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

describe("navigation", () => {
  it("starts in Deck and switches sections, marking the current one", async () => {
    const { user } = renderLocalApp({ section: null });
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").filter((link) => link.classList.contains("side-nav-link")).map((link) => link.textContent)).toEqual(["Deck", "Voice", "OBS, not connected", "Settings"]);
    expect(within(nav).getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Deck" })).toBeInTheDocument();

    await goTo(user, "Voice");
    expect(within(nav).getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Deck" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toHaveFocus();
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByLabelText("Text to speak")).toBeInTheDocument();
  });

  it("orders the sections Deck, Voice, OBS, Connect and Settings", () => {
    expect(SECTIONS).toEqual(["deck", "voice", "obs", "connect", "settings"]);
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

  it.each(["board", "speak"])("opens Voice when an older version remembered the %s section", (stored) => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(stored));
    renderLocalApp();
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toBeInTheDocument();
  });

  it("remembers the Voice space over the Deck default", () => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify("voice"));
    renderLocalApp();
    expect(screen.getByRole("link", { name: "Voice" })).toHaveAttribute("aria-current", "page");
  });

  it("opens Deck when the remembered section is unknown", () => {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify("nowhere"));
    renderLocalApp();
    expect(screen.getByRole("link", { name: "Deck" })).toHaveAttribute("aria-current", "page");
  });

  it("collapses the menu to icons, keeping names, and remembers it", async () => {
    const { user, view, services } = renderLocalApp({ section: null });
    const toggle = screen.getByRole("button", { name: "Collapse menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const deck = within(nav).getByRole("link", { name: "Deck" });
    expect(deck).toHaveAttribute("title", "Deck");
    expect(deck).toHaveAttribute("aria-current", "page");
    // The OBS status stays on the icon in the rail, and in its name and tooltip.
    const obs = within(nav).getByRole("link", { name: "OBS, not connected" });
    expect(obs).toHaveAttribute("title", "OBS, not connected");
    expect(obs.querySelector(".nav-status-off")).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) ?? "null")).toBe(true);

    view.unmount();
    render(<App services={services} />);
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
