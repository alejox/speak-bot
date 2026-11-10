import { ACTION_CATEGORIES, ACTION_REGISTRY, DEFAULT_BOARD_NAMES, KEY_ICON_IDS } from "@speed-deck/core";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalStorageLanguageStore } from "../src/adapters/local-storage-language-store";
import { DesktopSpeechError } from "../src/adapters/remote-speech-synthesizer";
import { describeSpeechError } from "../src/app/App";
import { KEY_COLOR_PRESETS } from "../src/app/key-draft";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { translate } from "../src/i18n/messages";
import { desktopState, renderLocalApp, renderRemoteApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("dictionaries", () => {
  it("have the same keys and placeholders in Spanish and English", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(es[key].trim(), key).not.toBe("");
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("name every action, parameter, category, icon and preset color", () => {
    const keys = new Set(Object.keys(en));
    for (const definition of Object.values(ACTION_REGISTRY)) {
      expect(keys, definition.labelKey).toContain(definition.labelKey);
      expect(keys, definition.descriptionKey).toContain(definition.descriptionKey);
      for (const param of definition.params) expect(keys, param.labelKey).toContain(param.labelKey);
    }
    for (const category of ACTION_CATEGORIES) expect(keys).toContain(`category.${category}`);
    for (const icon of KEY_ICON_IDS) expect(keys).toContain(`icon.${icon}`);
    for (const color of KEY_COLOR_PRESETS) expect(keys).toContain(`color.${color.name}`);
  });

  it("interpolates parameters", () => {
    expect(translate("es", "board.page", { page: 1, count: 2 })).toBe("Página 1 de 2");
    expect(translate("en", "board.page", { page: 1, count: 2 })).toBe("Page 1 of 2");
    expect(translate("en", "board.page")).toBe("Page {page} of {count}");
  });
});

describe("LocalStorageLanguageStore", () => {
  it("returns null until a supported language is chosen", () => {
    const store = new LocalStorageLanguageStore(localStorage, "test:language");
    expect(store.load()).toBeNull();
    localStorage.setItem("test:language", JSON.stringify("fr"));
    expect(store.load()).toBeNull();
    store.save("en");
    expect(store.load()).toBe("en");
  });
});

describe("describeSpeechError", () => {
  it("maps desktop error codes to localized messages", () => {
    expect(describeSpeechError(new DesktopSpeechError("Install espeak-ng.", "engine-unavailable"))).toEqual({
      key: "error.engineUnavailable",
      params: { detail: "Install espeak-ng." },
    });
    expect(describeSpeechError(new DesktopSpeechError("exit code 1", "speech-failed"))).toEqual({ key: "error.desktopSpeechFailed" });
    expect(describeSpeechError(new Error("boom"))).toEqual({ key: "error.speechFailed" });
  });
});

describe("App language", () => {
  it("is Spanish by default, with the Spanish Communication board on a new device", async () => {
    renderLocalApp({ language: null });
    expect(await screen.findByRole("button", { name: "Hola" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tablero" })).toHaveDisplayValue(DEFAULT_BOARD_NAMES.es);
    expect(screen.getByRole("link", { name: "Voz" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Deck" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
  });

  it("creates the English board on a new device when English was chosen", async () => {
    renderLocalApp({ language: "en" });
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Board" })).toHaveDisplayValue(DEFAULT_BOARD_NAMES.en);
  });

  it("switches to English from the settings, re-renders and remembers the choice", async () => {
    const { user, services } = renderLocalApp({ language: null });
    await goTo(user, "Ajustes");
    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma / Language" }), "en");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    await goTo(user, "Voice");
    expect(screen.getByRole("button", { name: "Speak" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(services.language.load()).toBe("en");
  });

  it("speaks with a voice matching the interface language when none is chosen", async () => {
    const { synthesizer, user } = renderLocalApp({ language: null });
    await goTo(user, "Ajustes");
    await screen.findByRole("option", { name: "Mónica · Español (España)" });
    await goTo(user, "Voz");
    await user.type(screen.getByLabelText("Texto para decir"), "Hola{Enter}");
    await goTo(user, "Ajustes");
    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma / Language" }), "en");
    await goTo(user, "Voice");
    await user.type(screen.getByLabelText("Text to speak"), "Hi{Enter}");
    expect(synthesizer.spoken.map((entry) => entry.options?.voiceId)).toEqual(["monica", "alex"]);
  });
});

describe("App language in Computer mode", () => {
  it("follows the desktop language when this device never chose one, live", async () => {
    const { emit } = renderRemoteApp({ language: null });
    expect(await screen.findByRole("link", { name: "Settings" })).toBeInTheDocument();
    act(() => emit({ type: "settings-changed", settings: { ...desktopState().settings, language: "es" } }));
    expect(screen.getByRole("link", { name: "Ajustes" })).toBeInTheDocument();
  });

  it("keeps this device's explicit choice and saves a new choice on the desktop", async () => {
    const { requests, user } = renderRemoteApp({ language: "es" });
    await goTo(user, "Ajustes");
    expect(await screen.findByRole("combobox", { name: "Hablar en" })).toHaveValue("computer");
    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma / Language" }), "en");
    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { language: "en" } });
    expect(screen.getByRole("combobox", { name: "Speak on" })).toBeInTheDocument();
  });
});
