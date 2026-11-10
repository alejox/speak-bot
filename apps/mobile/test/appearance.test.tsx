import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyAppearance } from "../src/adapters/appearance-dom";
import { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE, LocalStorageAppearanceStore } from "../src/adapters/local-storage-appearance-store";
import { boardOf, renderLocalApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const root = () => document.documentElement;

describe("LocalStorageAppearanceStore", () => {
  it("follows the system theme at normal text size until the user chooses", () => {
    expect(new LocalStorageAppearanceStore(localStorage).load()).toEqual({ theme: "system", textSize: "normal" });
    expect(DEFAULT_APPEARANCE).toEqual({ theme: "system", textSize: "normal" });
  });

  it("persists the choice on this device", () => {
    new LocalStorageAppearanceStore(localStorage).save({ theme: "dark", textSize: "extra-large" });
    expect(new LocalStorageAppearanceStore(localStorage).load()).toEqual({ theme: "dark", textSize: "extra-large" });
  });

  it("replaces only the stored values it does not know", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: "sepia", textSize: "large" }));
    expect(new LocalStorageAppearanceStore(localStorage).load()).toEqual({ theme: "system", textSize: "large" });
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: "light", textSize: 23 }));
    expect(new LocalStorageAppearanceStore(localStorage).load()).toEqual({ theme: "light", textSize: "normal" });
  });

  it.each(["not json {", JSON.stringify("dark"), JSON.stringify(null), JSON.stringify(["dark"])])("falls back to the defaults for %s", (stored) => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, stored);
    expect(new LocalStorageAppearanceStore(localStorage).load()).toEqual(DEFAULT_APPEARANCE);
  });

  it("works without storage", () => {
    const store = new LocalStorageAppearanceStore(null);
    store.save({ theme: "dark", textSize: "large" });
    expect(store.load()).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("applyAppearance", () => {
  it("marks a manual theme and a larger text size on the element", () => {
    const element = document.createElement("div");
    applyAppearance({ theme: "light", textSize: "large" }, element);
    expect(element).toHaveAttribute("data-theme", "light");
    expect(element).toHaveAttribute("data-text-size", "large");
  });

  it("leaves no attribute for the system theme and the normal size, so the stylesheet defaults apply", () => {
    const element = document.createElement("div");
    applyAppearance({ theme: "dark", textSize: "extra-large" }, element);
    applyAppearance(DEFAULT_APPEARANCE, element);
    expect(element).not.toHaveAttribute("data-theme");
    expect(element).not.toHaveAttribute("data-text-size");
  });

  it("keeps the browser theme colour in step with a manual theme", () => {
    const head = document.createElement("div");
    head.innerHTML = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" /><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171b22" />`;
    const [light, dark] = Array.from(head.querySelectorAll("meta"));
    applyAppearance({ theme: "dark", textSize: "normal" }, document.createElement("div"), head);
    expect(light).toHaveAttribute("content", "#171b22");
    expect(dark).toHaveAttribute("content", "#171b22");
    applyAppearance(DEFAULT_APPEARANCE, document.createElement("div"), head);
    expect(light).toHaveAttribute("content", "#ffffff");
    expect(dark).toHaveAttribute("content", "#171b22");
  });
});

describe("Appearance in the app", () => {
  it("applies the stored appearance to the root element", async () => {
    renderLocalApp({ appearance: { theme: "dark", textSize: "large" } });
    await screen.findByRole("heading", { level: 2, name: "Voice" });
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(root()).toHaveAttribute("data-text-size", "large");
  });

  it("leaves the root element alone when nothing was chosen", async () => {
    renderLocalApp();
    await screen.findByRole("heading", { level: 2, name: "Voice" });
    expect(root()).not.toHaveAttribute("data-theme");
    expect(root()).not.toHaveAttribute("data-text-size");
  });

  it("offers theme and text size in an Appearance group of the settings", async () => {
    const { user } = renderLocalApp();
    await goTo(user, "Settings");
    const group = screen.getByRole("group", { name: "Appearance" });
    const theme = within(group).getByRole("combobox", { name: "Theme" });
    const textSize = within(group).getByRole("combobox", { name: "Text size" });
    expect(theme).toHaveDisplayValue("System");
    expect(textSize).toHaveDisplayValue("Normal");
    expect(within(theme).getAllByRole("option").map((option) => option.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(within(textSize).getAllByRole("option").map((option) => option.textContent)).toEqual(["Normal", "Large", "Extra large"]);
  });

  it("changes the theme from the settings and remembers it", async () => {
    const { user, appearance } = renderLocalApp();
    await goTo(user, "Settings");
    await user.selectOptions(screen.getByRole("combobox", { name: "Theme" }), "Dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(appearance.load()).toEqual({ theme: "dark", textSize: "normal" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Theme" }), "System");
    expect(root()).not.toHaveAttribute("data-theme");
    expect(appearance.load()).toEqual(DEFAULT_APPEARANCE);
  });

  it("changes the text size from the settings and remembers it", async () => {
    const { user, appearance } = renderLocalApp();
    await goTo(user, "Settings");
    await user.selectOptions(screen.getByRole("combobox", { name: "Text size" }), "Extra large");
    expect(root()).toHaveAttribute("data-text-size", "extra-large");
    expect(appearance.load()).toEqual({ theme: "system", textSize: "extra-large" });
  });

  it("names the appearance settings in Spanish", async () => {
    const { user } = renderLocalApp({ language: "es" });
    await goTo(user, "Ajustes");
    const group = screen.getByRole("group", { name: "Apariencia" });
    expect(within(group).getByRole("combobox", { name: "Tema" })).toHaveDisplayValue("Según el sistema");
    expect(within(group).getByRole("combobox", { name: "Tamaño del texto" })).toHaveDisplayValue("Normal");
  });
});

describe("Space accent", () => {
  const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [], "deck")];
  const spaceOf = (heading: string) => screen.getByRole("heading", { level: 2, name: heading }).closest("[data-space]")?.getAttribute("data-space");

  it("marks each space so it gets its own accent, and the other sections share the Voice accent", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(spaceOf("Voice")).toBe("voice");
    await goTo(user, "Deck");
    expect(spaceOf("Deck")).toBe("deck");
    await goTo(user, "Settings");
    expect(spaceOf("Settings")).toBe("voice");
  });

  it("keeps the navigation inside the marked space", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await goTo(user, "Deck");
    expect(screen.getByRole("navigation", { name: "Sections" }).closest("[data-space]")).toHaveAttribute("data-space", "deck");
  });
});
