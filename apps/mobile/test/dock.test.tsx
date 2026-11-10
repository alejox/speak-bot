import type { Phrase, PhraseRepository, SpeakOptions, Voice } from "@speak-bot/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/adapters/local-storage-settings-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { DockApp } from "../src/app/DockApp";
import { isDockPath } from "../src/app/route";
import { createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { memoryLanguageStore } from "./i18n-helpers";

describe("isDockPath", () => {
  it("matches the dock route under the app base", () => {
    expect(isDockPath("/dock", "/")).toBe(true);
    expect(isDockPath("/dock/", "/")).toBe(true);
    expect(isDockPath("/speak-bot/dock", "/speak-bot/")).toBe(true);
    expect(isDockPath("/", "/")).toBe(false);
    expect(isDockPath("/docks", "/")).toBe(false);
    expect(isDockPath("/dock/extra", "/")).toBe(false);
    expect(isDockPath("/dock", "/speak-bot/")).toBe(false);
  });
});

class LocalSynthesizer implements AppSpeechSynthesizer {
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

const localRepository: PhraseRepository = {
  list: async (): Promise<Phrase[]> => [{ id: "l1", text: "Local phrase", slot: 0, createdAt: 1 }],
  save: async () => {},
  delete: async () => {},
  update: async () => {},
  replaceAll: async () => {},
};

function desktopRoute(request: RecordedRequest) {
  switch (`${request.method} ${request.url}`) {
    case "GET /api/health":
      return { body: { ok: true, name: "speak-bot-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: true } } };
    case "GET /api/phrases":
      return { body: [{ id: "d1", text: "Hola desde la computadora", slot: 0, createdAt: 1 }] };
    case "GET /api/voices":
      return { body: [] };
    case "GET /api/settings":
      return { body: { voiceId: "", rate: 1, deviceId: "", language: "es" } };
    case "POST /api/speak":
      return { status: 202, body: { ok: true } };
    case "POST /api/stop":
      return { body: { ok: true } };
    default:
      return undefined;
  }
}

function setup(route: (request: RecordedRequest) => { status?: number; body?: unknown } | undefined = desktopRoute) {
  FakeSocket.instances = [];
  const fake = createFakeFetch(route);
  const local = new LocalSynthesizer();
  const services: AppServices = {
    synthesizer: local,
    phrases: { repository: localRepository, generateId: () => "x", now: () => 1 },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore(null),
    isFirstRun: () => true,
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: "127.0.0.1:4545", hostname: "127.0.0.1" },
      // The phone view chose "This device"; the dock must still speak on the computer.
      targetStore: { load: () => "device", save: () => {} },
    }),
  };
  render(<DockApp services={services} />);
  return { requests: fake.requests, local, user: userEvent.setup() };
}

describe("DockApp", () => {
  it("always speaks on the computer, with no side menu", async () => {
    const { requests, local, user } = setup();

    await user.click(await screen.findByRole("button", { name: "Decir: Hola desde la computadora" }));
    await user.type(screen.getByRole("textbox", { name: "Texto para decir" }), "Gracias por el follow{Enter}");

    const spoken = requests.filter((r) => r.method === "POST" && r.url === "/api/speak").map((r) => (r.body as { text: string }).text);
    expect(spoken).toEqual(["Hola desde la computadora", "Gracias por el follow"]);
    expect(local.spoken).toEqual([]);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decir: Local phrase" })).not.toBeInTheDocument();
  });

  it("shows an empty deck the streamer can fill from the dock", async () => {
    let phrases: Phrase[] = [];
    const { requests, user } = setup((request) => {
      if (request.url !== "/api/phrases") return desktopRoute(request);
      if (request.method === "POST") phrases = [request.body as Phrase];
      return request.method === "GET" ? { body: phrases } : { status: 201, body: request.body };
    });

    const deck = await screen.findByRole("region", { name: "Frases" });
    await user.click(await within(deck).findByRole("button", { name: "Agregar frase en el botón 1" }));
    await user.type(screen.getByRole("textbox", { name: "Texto de la frase" }), "Bienvenidos");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await within(deck).findByRole("button", { name: "Decir: Bienvenidos" })).toBeInTheDocument();
    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/phrases", body: expect.objectContaining({ slot: 0 }) }));
    expect(within(deck).getByText("Página 1 de 1")).toBeInTheDocument();
    expect(within(deck).getAllByRole("listitem")).toHaveLength(15);
  });

  it("stops speech on the computer", async () => {
    const { requests, user } = setup();
    await screen.findByRole("button", { name: "Decir: Hola desde la computadora" });

    // With live events the dock waits for the desktop's "end", so Stop stays enabled meanwhile.
    for (const socket of FakeSocket.instances) socket.open();
    await user.type(screen.getByRole("textbox", { name: "Texto para decir" }), "Un texto largo");
    await user.click(screen.getByRole("button", { name: "Hablar" }));
    await user.click(screen.getByRole("button", { name: "Detener" }));

    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/stop" }));
  });

  it("explains, in the interface language, that the desktop app was not found", async () => {
    const { local } = setup(() => undefined);

    expect(await screen.findByText(/No se encontró la app de Speak Bot en la computadora/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(local.spoken).toEqual([]);
  });
});
