import { DEFAULT_PHRASES_BY_LANGUAGE, type Phrase, type PhraseRepository, type SpeakOptions, type Voice } from "@speed-deck/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/adapters/local-storage-settings-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { SECTION_STORAGE_KEY } from "../src/app/use-section";
import { boardsOf, createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { goTo, memoryLanguageStore } from "./i18n-helpers";

class Synthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: string[] = [];
  async speak(text: string, _options?: SpeakOptions) {
    this.spoken.push(text);
  }
  cancel() {}
  async listVoices(): Promise<Voice[]> {
    return [];
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
  async update(phrase: Phrase) {
    this.phrases = this.phrases.map((p) => (p.id === phrase.id ? phrase : p));
  }
  async delete(id: string) {
    this.phrases = this.phrases.filter((p) => p.id !== id);
  }
  async replaceAll(phrases: Phrase[]) {
    this.phrases = [...phrases];
  }
}

const saved: Phrase[] = [
  { id: "p1", text: "Water please", slot: 0, createdAt: 1 },
  { id: "p2", text: "I am tired", slot: 1, createdAt: 2 },
];

function setupLocal(language: "es" | "en" = "en") {
  const synthesizer = new Synthesizer();
  const repository = new MemoryRepository([...saved]);
  let nextId = 0;
  const services: AppServices = {
    synthesizer,
    phrases: { repository, generateId: () => `id-${++nextId}`, now: () => 100 + nextId },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore(language),
    isFirstRun: () => false,
  };
  const view = render(<App services={services} />);
  return { synthesizer, repository, services, view, user: userEvent.setup() };
}

describe("navigation", () => {
  it("starts on Speak and switches sections, marking the current one", async () => {
    const { user } = setupLocal();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByRole("link", { name: "Speak" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Text to speak")).toBeInTheDocument();

    await goTo(user, "Phrases");

    expect(within(nav).getByRole("link", { name: "Phrases" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Speak" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 2, name: "Phrases" })).toHaveFocus();
    expect(screen.queryByLabelText("Text to speak")).not.toBeInTheDocument();
  });

  it("works with the keyboard", async () => {
    const { user } = setupLocal();
    const settingsLink = screen.getByRole("link", { name: "Settings" });

    settingsLink.focus();
    await user.keyboard("{Enter}");

    expect(settingsLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("combobox", { name: "Voice" })).toBeInTheDocument();
  });

  it("remembers the last section", async () => {
    const { user, view, services } = setupLocal();
    await goTo(user, "Settings");
    expect(JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY) ?? "null")).toBe("settings");

    view.unmount();
    render(<App services={services} />);

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("offers quick phrases on the Speak section", async () => {
    const { synthesizer, user } = setupLocal();
    const quick = await screen.findByRole("region", { name: "Quick phrases" });

    await user.click(within(quick).getByRole("button", { name: "Speak: I am tired" }));

    expect(synthesizer.spoken).toEqual(["I am tired"]);
  });
});

describe("phrase board", () => {
  it("speaks a phrase on tap and opens the editor instead in edit mode", async () => {
    const { synthesizer, repository, user } = setupLocal();
    await goTo(user, "Phrases");
    const board = screen.getByRole("region", { name: "Saved phrases" });

    await user.click(await within(board).findByRole("button", { name: "Speak: Water please" }));
    expect(synthesizer.spoken).toEqual(["Water please"]);

    await user.click(within(board).getByRole("button", { name: "Edit" }));
    await user.click(within(board).getByRole("button", { name: "Edit phrase: Water please" }));

    expect(screen.getByRole("dialog", { name: "Edit phrase · button 1" })).toBeInTheDocument();
    expect(synthesizer.spoken).toEqual(["Water please"]);
    expect(repository.phrases).toHaveLength(2);
  });

  it("asks before restoring the defaults and keeps the phrases on cancel", async () => {
    const { repository, user } = setupLocal("es");
    await goTo(user, "Frases");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const restore = screen.getByRole("button", { name: "Restaurar frases predeterminadas" });

    await user.click(restore);
    const prompt = screen.getByRole("group", { name: /¿Seguro\? Se borrarán tus frases actuales/ });
    expect(within(prompt).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.click(within(prompt).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restaurar frases predeterminadas" })).toHaveFocus();
    expect(repository.phrases.map((p) => p.text)).toEqual(saved.map((p) => p.text));
  });

  it("replaces the phrases with the defaults in the current language after confirming", async () => {
    const { repository, user } = setupLocal("es");
    await goTo(user, "Frases");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    await user.click(screen.getByRole("button", { name: "Restaurar frases predeterminadas" }));
    await user.click(screen.getByRole("button", { name: "Sí, restaurar" }));

    expect(await screen.findByText("Se restauraron las frases predeterminadas.")).toBeInTheDocument();
    expect(repository.phrases.map((p) => p.text)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.es]);
    await user.click(screen.getByRole("button", { name: "Listo" }));
    const buttons = screen.getAllByRole("button", { name: /^Decir: / });
    expect(buttons.map((button) => button.textContent)).toEqual([...DEFAULT_PHRASES_BY_LANGUAGE.es]);
  });
});

function desktopRoute() {
  let phrases: Phrase[] = [{ id: "d1", text: "Hello from desktop", slot: 0, createdAt: 1 }];
  return (request: RecordedRequest) => {
    switch (`${request.method} ${request.url}`) {
      case "GET /api/health":
        return { body: { ok: true, name: "speed-deck-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: false } } };
      case "GET /api/boards":
        return { body: boardsOf(phrases) };
      case "GET /api/voices":
        return { body: [] };
      case "GET /api/settings":
        return { body: { voiceId: "", rate: 1, deviceId: "", language: "en" } };
      case "POST /api/speak":
        return { status: 202, body: { ok: true } };
      case "POST /api/boards/restore-default":
        phrases = [{ id: "r1", text: "Hello", slot: 0, createdAt: 1 }];
        return { body: boardsOf(phrases)[0] };
      default:
        return undefined;
    }
  };
}

function setupRemote() {
  FakeSocket.instances = [];
  const fake = createFakeFetch(desktopRoute());
  const local = new Synthesizer();
  const localRepository = new MemoryRepository([{ id: "l1", text: "Local phrase", slot: 0, createdAt: 1 }]);
  const services: AppServices = {
    synthesizer: local,
    phrases: { repository: localRepository, generateId: () => "x", now: () => 1 },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore("en"),
    isFirstRun: () => false,
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: "desktop:4545" },
      targetStore: { load: () => null, save: () => {} },
    }),
  };
  render(<App services={services} />);
  return { requests: fake.requests, local, localRepository, user: userEvent.setup() };
}

describe("phrase board in Computer mode", () => {
  it("speaks through the desktop", async () => {
    const { requests, local, user } = setupRemote();
    await goTo(user, "Phrases");

    await user.click(await screen.findByRole("button", { name: "Speak: Hello from desktop" }));

    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/speak", body: expect.objectContaining({ text: "Hello from desktop" }) }));
    expect(local.spoken).toEqual([]);
  });

  it("restores the defaults on the desktop after confirming, and not on cancel", async () => {
    const { requests, localRepository, user } = setupRemote();
    await goTo(user, "Phrases");
    await screen.findByRole("button", { name: "Speak: Hello from desktop" });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    await user.click(screen.getByRole("button", { name: "Restore default phrases" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requests.some((r) => r.url === "/api/boards/restore-default")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Restore default phrases" }));
    await user.click(screen.getByRole("button", { name: "Yes, restore" }));

    expect(await screen.findByText("Default phrases restored.")).toBeInTheDocument();
    expect(requests).toContainEqual({ method: "POST", url: "/api/boards/restore-default", body: { language: "en" } });
    expect(await screen.findByRole("button", { name: "Edit phrase: Hello" })).toBeInTheDocument();
    expect(localRepository.phrases.map((p) => p.text)).toEqual(["Local phrase"]);
  });
});
