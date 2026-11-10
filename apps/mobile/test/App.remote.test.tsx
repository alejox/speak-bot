import type { Phrase, PhraseRepository, SpeakOptions, Voice } from "@speak-bot/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/adapters/local-storage-settings-store";
import type { SpeakTarget } from "../src/adapters/local-storage-speak-target-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { goTo, memoryLanguageStore } from "./i18n-helpers";

class LocalSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: string[] = [];
  async speak(text: string, _options?: SpeakOptions) {
    this.spoken.push(text);
  }
  cancel() {}
  async listVoices(): Promise<Voice[]> {
    return [{ id: "local-voice", name: "Local Voice", lang: "en-US", isDefault: true }];
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
    this.phrases.push(phrase);
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

function desktopRoute(supportsDeviceSelection = true) {
  let settings = { voiceId: "", rate: 1, deviceId: "" };
  return (request: RecordedRequest) => {
    switch (`${request.method} ${request.url}`) {
      case "GET /api/health":
        return {
          body: {
            ok: true,
            name: "speak-bot-desktop",
            capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection },
          },
        };
      case "GET /api/phrases":
        return { body: [{ id: "d1", text: "Hello from desktop", slot: 0, createdAt: 1 }] };
      case "GET /api/voices":
        return { body: [{ id: "Alex", name: "Alex", lang: "en-US", isDefault: false }] };
      case "GET /api/devices":
        return { body: [{ id: "BlackHole 2ch", name: "BlackHole 2ch" }] };
      case "GET /api/settings":
        return { body: settings };
      case "PUT /api/settings":
        settings = { ...settings, ...(request.body as object) };
        return { body: settings };
      case "POST /api/speak":
        return { status: 202, body: { ok: true } };
      default:
        return undefined;
    }
  };
}

function setup({ route = desktopRoute(), storedTarget = null as SpeakTarget | null } = {}) {
  FakeSocket.instances = [];
  const fake = createFakeFetch(route);
  let target = storedTarget;
  const local = new LocalSynthesizer();
  const services: AppServices = {
    synthesizer: local,
    phrases: { repository: new MemoryRepository([{ id: "l1", text: "Local phrase", slot: 0, createdAt: 1 }]), generateId: () => "x", now: () => 1 },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    isFirstRun: () => false,
    language: memoryLanguageStore("en"),
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: "desktop:4545" },
      generateId: () => "remote-id",
      targetStore: { load: () => target, save: (next) => void (target = next) },
    }),
  };
  render(<App services={services} />);
  return { requests: fake.requests, local, user: userEvent.setup(), getTarget: () => target };
}

describe("App remote mode", () => {
  it("defaults to Computer when served by the desktop and speaks through POST /api/speak", async () => {
    const { requests, local, user } = setup();

    expect(await screen.findByRole("button", { name: "Speak: Hello from desktop" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Text to speak"), "Hi stream");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/speak", body: expect.objectContaining({ text: "Hi stream" }) }));
    expect(local.spoken).toEqual([]);

    await goTo(user, "Settings");
    expect(screen.getByRole("combobox", { name: "Speak on" })).toHaveValue("computer");
  });

  it("shows desktop voices and saves the output device on the desktop", async () => {
    const { requests, user } = setup();
    await goTo(user, "Settings");

    expect(await screen.findByRole("option", { name: "Alex (en-US)" })).toBeInTheDocument();
    const device = await screen.findByRole("combobox", { name: "Output device" });
    await screen.findByRole("option", { name: "BlackHole 2ch" });
    await user.selectOptions(device, "BlackHole 2ch");

    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { deviceId: "BlackHole 2ch" } });
  });

  it("hides the output device selector when the desktop cannot select devices", async () => {
    const { user } = setup({ route: desktopRoute(false) });

    await screen.findByRole("button", { name: "Speak: Hello from desktop" });
    await goTo(user, "Settings");
    await screen.findByRole("combobox", { name: "Speak on" });
    expect(screen.queryByRole("combobox", { name: "Output device" })).not.toBeInTheDocument();
  });

  it("switches back to this device and persists the choice", async () => {
    const { local, user, getTarget, requests } = setup();
    await goTo(user, "Settings");

    await user.selectOptions(await screen.findByRole("combobox", { name: "Speak on" }), "device");
    expect(getTarget()).toBe("device");
    expect(screen.queryByRole("combobox", { name: "Output device" })).not.toBeInTheDocument();
    await goTo(user, "Speak");
    await user.click(await screen.findByRole("button", { name: "Speak: Local phrase" }));

    expect(local.spoken).toEqual(["Local phrase"]);
    expect(requests.filter((r) => r.url === "/api/speak")).toEqual([]);
  });

  it("stays local and hides the setting when no desktop answers", async () => {
    const { user } = setup({ route: () => undefined });

    expect(await screen.findByRole("button", { name: "Speak: Local phrase" })).toBeInTheDocument();
    await goTo(user, "Settings");
    expect(screen.queryByRole("combobox", { name: "Speak on" })).not.toBeInTheDocument();
  });
});
