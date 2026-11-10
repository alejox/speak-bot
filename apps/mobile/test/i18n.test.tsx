import {
  DEFAULT_PHRASES_BY_LANGUAGE,
  type Phrase,
  type PhraseRepository,
  type SpeakOptions,
  type UiLanguage,
  type Voice,
} from "@speak-bot/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LocalStorageLanguageStore } from "../src/adapters/local-storage-language-store";
import { DEFAULT_SETTINGS } from "../src/adapters/local-storage-settings-store";
import { DesktopSpeechError } from "../src/adapters/remote-speech-synthesizer";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App, describeSpeechError } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { translate } from "../src/i18n/messages";
import { createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { goTo, memoryLanguageStore } from "./i18n-helpers";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("dictionaries", () => {
  it("have the same keys and placeholders in Spanish and English", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(es[key].trim(), key).not.toBe("");
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("interpolates parameters", () => {
    expect(translate("es", "phrases.speakLabel", { text: "Hola" })).toBe("Decir: Hola");
    expect(translate("en", "phrases.speakLabel", { text: "Hi" })).toBe("Speak: Hi");
    expect(translate("en", "phrases.speakLabel")).toBe("Speak: {text}");
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

class LocalSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: Array<{ text: string; options: SpeakOptions | undefined }> = [];
  async speak(text: string, options?: SpeakOptions) {
    this.spoken.push({ text, options });
  }
  cancel() {}
  async listVoices(): Promise<Voice[]> {
    return [
      { id: "alex", name: "Alex", lang: "en-US", isDefault: true },
      { id: "monica", name: "Mónica", lang: "es-ES", isDefault: false },
    ];
  }
  onVoicesChanged() {
    return () => {};
  }
}

class MemoryRepository implements PhraseRepository {
  constructor(public phrases: Phrase[] = []) {}
  async list() {
    return [...this.phrases];
  }
  async save(phrase: Phrase) {
    this.phrases = [...this.phrases.filter((p) => p.id !== phrase.id), phrase];
  }
  async delete(id: string) {
    this.phrases = this.phrases.filter((p) => p.id !== id);
  }
  async replaceAll(phrases: Phrase[]) {
    this.phrases = [...phrases];
  }
}

function setupLocal({ language = null as UiLanguage | null, firstRun = false } = {}) {
  const synthesizer = new LocalSynthesizer();
  const languageStore = memoryLanguageStore(language);
  let nextId = 0;
  const services: AppServices = {
    synthesizer,
    phrases: { repository: new MemoryRepository(), generateId: () => `id-${++nextId}`, now: () => nextId },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: languageStore,
    isFirstRun: () => firstRun,
  };
  render(<App services={services} />);
  return { synthesizer, languageStore, user: userEvent.setup() };
}

describe("App language", () => {
  it("is Spanish by default", async () => {
    setupLocal();

    expect(await screen.findByRole("button", { name: "Hablar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Texto para decir")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
  });

  it("switches to English from the settings, re-renders and remembers the choice", async () => {
    const { languageStore, user } = setupLocal();
    await goTo(user, "Ajustes");

    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma / Language" }), "en");

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    await goTo(user, "Speak");
    expect(screen.getByRole("button", { name: "Speak" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hablar" })).not.toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(languageStore.saved).toEqual(["en"]);
  });

  it("seeds Spanish default phrases on first run", async () => {
    const { user } = setupLocal({ firstRun: true });
    await goTo(user, "Frases");

    const buttons = await screen.findAllByRole("button", { name: /^Decir: / });
    expect(buttons.map((button) => button.textContent)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.es]);
  });

  it("seeds English default phrases on first run when English was chosen", async () => {
    const { user } = setupLocal({ firstRun: true, language: "en" });
    await goTo(user, "Phrases");

    const buttons = await screen.findAllByRole("button", { name: /^Speak: / });
    expect(buttons.map((button) => button.textContent)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.en]);
  });

  it("speaks with a voice matching the interface language when none is chosen", async () => {
    const { synthesizer, user } = setupLocal();
    await goTo(user, "Ajustes");
    await screen.findByRole("option", { name: "Mónica (es-ES)" });
    await goTo(user, "Hablar");

    await user.type(screen.getByLabelText("Texto para decir"), "Hola{Enter}");
    await goTo(user, "Ajustes");
    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma / Language" }), "en");
    await goTo(user, "Speak");
    await user.type(screen.getByLabelText("Text to speak"), "Hi{Enter}");

    expect(synthesizer.spoken.map((entry) => entry.options?.voiceId)).toEqual(["monica", "alex"]);
  });
});

function desktopRoute(language: UiLanguage) {
  let settings = { voiceId: "", rate: 1, deviceId: "", language };
  return (request: RecordedRequest) => {
    switch (`${request.method} ${request.url}`) {
      case "GET /api/health":
        return { body: { ok: true, name: "speak-bot-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: false } } };
      case "GET /api/phrases":
        return { body: [] };
      case "GET /api/voices":
        return { body: [] };
      case "GET /api/settings":
        return { body: settings };
      case "PUT /api/settings":
        settings = { ...settings, ...(request.body as object) };
        return { body: settings };
      default:
        return undefined;
    }
  };
}

function setupRemote({ desktopLanguage, choice }: { desktopLanguage: UiLanguage; choice: UiLanguage | null }) {
  FakeSocket.instances = [];
  const fake = createFakeFetch(desktopRoute(desktopLanguage));
  const services: AppServices = {
    synthesizer: new LocalSynthesizer(),
    phrases: { repository: new MemoryRepository(), generateId: () => "x", now: () => 1 },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore(choice),
    isFirstRun: () => false,
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: "desktop:4545" },
      targetStore: { load: () => null, save: () => {} },
    }),
  };
  render(<App services={services} />);
  return { requests: fake.requests, user: userEvent.setup() };
}

describe("App language in Computer mode", () => {
  it("follows the desktop language when this device never chose one", async () => {
    setupRemote({ desktopLanguage: "en", choice: null });

    expect(await screen.findByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speak" })).toBeInTheDocument();
  });

  it("keeps this device's explicit choice and saves a new choice on the desktop", async () => {
    const { requests, user } = setupRemote({ desktopLanguage: "en", choice: "es" });
    await goTo(user, "Ajustes");

    const speakOn = await screen.findByRole("combobox", { name: "Hablar en" });
    expect(speakOn).toHaveValue("computer");
    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma / Language" }), "en");

    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { language: "en" } });
    expect(screen.getByRole("combobox", { name: "Speak on" })).toBeInTheDocument();
  });
});
