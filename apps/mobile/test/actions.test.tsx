import type { Phrase, PhraseRepository, SpeakOptions, Voice } from "@speak-bot/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type SpeechSettings } from "../src/adapters/local-storage-settings-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { DockApp } from "../src/app/DockApp";
import { createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { goTo, memoryLanguageStore } from "./i18n-helpers";

class Synthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: Array<{ text: string; options: SpeakOptions | undefined }> = [];
  cancelCount = 0;
  constructor(private readonly voices: Voice[] = []) {}
  async speak(text: string, options?: SpeakOptions) {
    this.spoken.push({ text, options });
  }
  cancel() {
    this.cancelCount += 1;
  }
  async listVoices(): Promise<Voice[]> {
    return this.voices;
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

const voices: Voice[] = [
  { id: "en-voice", name: "Samantha", lang: "en-US", isDefault: true },
  { id: "es-voice", name: "Mónica", lang: "es-ES", isDefault: false },
];

function setupLocal() {
  const synthesizer = new Synthesizer(voices);
  const saved: SpeechSettings[] = [];
  let settings = DEFAULT_SETTINGS;
  const services: AppServices = {
    synthesizer,
    phrases: { repository: new MemoryRepository([{ id: "p1", text: "Water please", slot: 0, createdAt: 1 }]), generateId: () => "x", now: () => 1 },
    settings: {
      load: () => settings,
      save: (next) => {
        settings = next;
        saved.push(next);
      },
    },
    language: memoryLanguageStore("en"),
    isFirstRun: () => false,
  };
  render(<App services={services} />);
  return { synthesizer, saved, user: userEvent.setup() };
}

async function openActions(user: ReturnType<typeof userEvent.setup>) {
  await goTo(user, "Phrases");
  await screen.findByRole("button", { name: "Speak: Water please" });
  return screen.getByRole("region", { name: "Actions" });
}

describe("actions deck on this device", () => {
  it("offers the five actions, with the OBS ones disabled and explained", async () => {
    const { user } = setupLocal();
    const actions = await openActions(user);

    expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "■Stop",
      "↻Repeat",
      "⌫Clear caption",
      "CCHide captions",
      "🗣Voice: English",
    ]);
    expect(within(actions).getByRole("button", { name: "Clear caption" })).toBeDisabled();
    expect(within(actions).getByRole("button", { name: "Hide captions" })).toBeDisabled();
    expect(within(actions).getByRole("button", { name: "Clear caption" })).toHaveAccessibleDescription("Needs the computer app (OBS).");
    expect(within(actions).getByRole("button", { name: "Repeat" })).toBeEnabled();
  });

  it("says that there is nothing to repeat, then repeats the last spoken text", async () => {
    const { synthesizer, user } = setupLocal();
    const actions = await openActions(user);

    await user.click(within(actions).getByRole("button", { name: "Repeat" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nothing has been said yet to repeat.");
    expect(synthesizer.spoken).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Speak: Water please" }));
    await user.click(within(actions).getByRole("button", { name: "Repeat" }));

    expect(synthesizer.spoken.map((entry) => entry.text)).toEqual(["Water please", "Water please"]);
  });

  it("stops speech and announces it", async () => {
    const { synthesizer, user } = setupLocal();
    const actions = await openActions(user);

    await user.click(within(actions).getByRole("button", { name: "Stop" }));

    expect(synthesizer.cancelCount).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Speech stopped.");
  });

  it("switches the voice language and speaks with a voice for that language", async () => {
    const { synthesizer, saved, user } = setupLocal();
    const actions = await openActions(user);

    await user.click(screen.getByRole("button", { name: "Speak: Water please" }));
    await user.click(within(actions).getByRole("button", { name: "Voice: English" }));
    expect(await within(actions).findByRole("button", { name: "Voice: Español" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Voice language: Español.");
    await user.click(screen.getByRole("button", { name: "Speak: Water please" }));

    expect(synthesizer.spoken.map((entry) => entry.options?.voiceId)).toEqual(["en-voice", "es-voice"]);
    expect(saved.at(-1)).toEqual({ voiceId: "", rate: 1, voiceLanguage: "es" });
  });
});

function desktopRoute(overrides: Partial<Record<string, { status?: number; body?: unknown }>> = {}) {
  let settings: Record<string, unknown> = { voiceId: "Alex", rate: 1, deviceId: "", language: "en", captionsVisible: true };
  return (request: RecordedRequest) => {
    const key = `${request.method} ${request.url}`;
    if (overrides[key]) return overrides[key];
    switch (key) {
      case "GET /api/health":
        return { body: { ok: true, name: "speak-bot-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: false } } };
      case "GET /api/phrases":
        return { body: [{ id: "d1", text: "Water please", slot: 0, createdAt: 1 }] };
      case "GET /api/voices":
        return { body: [] };
      case "GET /api/settings":
        return { body: settings };
      case "PUT /api/settings":
        settings = { ...settings, ...(request.body as object) };
        return { body: settings };
      case "POST /api/speak":
      case "POST /api/repeat":
        return { status: 202, body: { ok: true } };
      case "POST /api/captions/clear":
      case "POST /api/stop":
        return { body: { ok: true } };
      default:
        return undefined;
    }
  };
}

function remoteServices(route: (request: RecordedRequest) => { status?: number; body?: unknown } | undefined) {
  FakeSocket.instances = [];
  const fake = createFakeFetch(route);
  const local = new Synthesizer();
  const services: AppServices = {
    synthesizer: local,
    phrases: { repository: new MemoryRepository(), generateId: () => "x", now: () => 1 },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore("en"),
    isFirstRun: () => false,
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: "desktop:4545", hostname: "desktop" },
      targetStore: { load: () => null, save: () => {} },
    }),
  };
  return { services, requests: fake.requests, local };
}

describe("actions deck in Computer mode", () => {
  it("repeats, clears the caption and toggles captions on the desktop", async () => {
    const { services, requests, local } = remoteServices(desktopRoute());
    render(<App services={services} />);
    const user = userEvent.setup();
    const actions = await openActions(user);

    await user.click(within(actions).getByRole("button", { name: "Repeat" }));
    expect(requests).toContainEqual({ method: "POST", url: "/api/repeat", body: {} });

    await user.click(within(actions).getByRole("button", { name: "Clear caption" }));
    expect(requests).toContainEqual({ method: "POST", url: "/api/captions/clear", body: {} });
    expect(await screen.findByText("Caption cleared.")).toBeInTheDocument();

    const toggle = await within(actions).findByRole("button", { name: "Hide captions" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { captionsVisible: false } });
    expect(await within(actions).findByRole("button", { name: "Show captions" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Captions hidden in OBS.");
    expect(local.spoken).toEqual([]);
  });

  it("explains when the desktop has nothing to repeat", async () => {
    const { services } = remoteServices(
      desktopRoute({ "POST /api/repeat": { status: 404, body: { error: "Nothing has been spoken yet.", code: "nothing-to-repeat" } } }),
    );
    render(<App services={services} />);
    const user = userEvent.setup();
    const actions = await openActions(user);

    await user.click(within(actions).getByRole("button", { name: "Repeat" }));

    expect(await screen.findByText("Nothing has been said yet to repeat.")).toBeInTheDocument();
  });

  it("switches the desktop voice language and clears the chosen voice", async () => {
    const { services, requests } = remoteServices(desktopRoute());
    render(<App services={services} />);
    const user = userEvent.setup();
    const actions = await openActions(user);

    await user.click(await within(actions).findByRole("button", { name: "Voice: English" }));

    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { voiceLanguage: "es", voiceId: "" } });
    expect(await within(actions).findByRole("button", { name: "Voice: Español" })).toBeInTheDocument();
  });

  it("follows caption visibility changed from another device", async () => {
    const { services } = remoteServices(desktopRoute());
    render(<App services={services} />);
    const user = userEvent.setup();
    const actions = await openActions(user);
    await within(actions).findByRole("button", { name: "Hide captions" });

    act(() => {
      for (const socket of FakeSocket.instances) socket.emit({ type: "captions-visibility", visible: false, at: 1 });
    });

    expect(await within(actions).findByRole("button", { name: "Show captions" })).toBeInTheDocument();
  });

  it("is available in the OBS dock", async () => {
    const { services, requests } = remoteServices(desktopRoute());
    render(<DockApp services={services} />);
    const user = userEvent.setup();

    const actions = await screen.findByRole("region", { name: "Actions" });
    await user.click(await within(actions).findByRole("button", { name: "Clear caption" }));

    expect(requests).toContainEqual({ method: "POST", url: "/api/captions/clear", body: {} });
  });
});
