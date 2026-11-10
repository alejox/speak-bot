import type { Voice } from "@speed-deck/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/adapters/local-storage-settings-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { createLocalBoardStore } from "../src/adapters/board-stores";
import { LocalStorageRecentPhrasesStore } from "../src/adapters/local-storage-recent-phrases-store";
import { LocalStorageBoardRepository } from "../src/adapters/local-storage-board-repository";
import { boardsOf, createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { memoryAppearanceStore } from "./app-fakes";
import { goTo, memoryLanguageStore } from "./i18n-helpers";

const synthesizer: AppSpeechSynthesizer = {
  isSupported: true,
  speak: async () => {},
  cancel: () => {},
  listVoices: async (): Promise<Voice[]> => [],
  onVoicesChanged: () => () => {},
};

const connection = {
  port: 4545,
  lanUrls: ["http://192.168.1.20:4545/", "http://10.0.0.5:4545/"],
  overlayUrl: "http://localhost:4545/overlay",
  dockUrl: "http://127.0.0.1:4545/dock",
};

function route(request: RecordedRequest) {
  switch (`${request.method} ${request.url}`) {
    case "GET /api/health":
      return { body: { ok: true, name: "speed-deck-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: false } } };
    case "GET /api/connection":
      return { body: connection };
    case "GET /api/boards":
      return { body: boardsOf([]) };
    case "GET /api/voices":
      return { body: [] };
    case "GET /api/settings":
      return { body: { voiceId: "", rate: 1, deviceId: "" } };
    default:
      return undefined;
  }
}

function setup({ hostname = "localhost", answer = route } = {}) {
  const copied: string[] = [];
  const { fetch, requests } = createFakeFetch(answer);
  const services: AppServices = {
    synthesizer,
    boards: createLocalBoardStore(new LocalStorageBoardRepository(null), () => "x"),
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore("en"),
    appearance: memoryAppearanceStore(),
    recentPhrases: new LocalStorageRecentPhrasesStore(null),
    desktop: createDesktopServices({
      fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: `${hostname}:4545`, hostname },
      targetStore: { load: () => null, save: () => {} },
      createQrCode: async (text) => `data:qr,${text}`,
      copyText: async (text) => {
        copied.push(text);
        return true;
      },
    }),
  };
  render(<App services={services} />);
  return { copied, requests };
}

describe("App connect panel", () => {
  it("shows the phone QR code and copies the OBS URL on the computer itself", async () => {
    const { copied } = setup();
    await userEvent.click(await screen.findByRole("link", { name: "Connect" }));
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Deck", "Voice", "OBS, not connected", "Connect", "Settings"]);

    const qr = await screen.findByRole("img", { name: "QR code for http://192.168.1.20:4545/" });
    expect(qr).toHaveAttribute("src", "data:qr,http://192.168.1.20:4545/");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Network address" }), "http://10.0.0.5:4545/");
    expect(await screen.findByRole("img", { name: "QR code for http://10.0.0.5:4545/" })).toHaveAttribute("src", "data:qr,http://10.0.0.5:4545/");

    await userEvent.click(screen.getByRole("button", { name: "Copy OBS URL" }));
    expect(copied).toEqual(["http://localhost:4545/overlay"]);
    expect(await screen.findByText("Copied!")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy dock URL" }));
    expect(copied).toEqual(["http://localhost:4545/overlay", "http://127.0.0.1:4545/dock"]);
  });

  it("is hidden on the phone (page opened through the LAN address)", async () => {
    const { requests } = setup({ hostname: "192.168.1.20" });
    await goTo(userEvent, "Settings");
    await screen.findByRole("combobox", { name: "Speak on" });
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect your phone" })).not.toBeInTheDocument();
    expect(requests.some((request) => request.url === "/api/connection")).toBe(false);
  });

  it("is hidden when no desktop serves the page (e.g. GitHub Pages)", async () => {
    const { requests } = setup({ answer: () => undefined });
    await screen.findByRole("link", { name: "Voice" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("heading", { name: "Connect your phone" })).not.toBeInTheDocument();
    expect(requests.some((request) => request.url === "/api/connection")).toBe(false);
  });
});
