import {
  buildDefaultBoard,
  buildDefaultDeckBoard,
  DEFAULT_DECK_BOARD_ID,
  makeBoard,
  type Board,
  type BoardKind,
  type Key,
  type ObsState,
  type SpeakOptions,
  type UiLanguage,
  type Voice,
} from "@speed-deck/core";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLocalBoardStore } from "../src/adapters/board-stores";
import { DEFAULT_APPEARANCE, type Appearance, type AppearanceStore } from "../src/adapters/local-storage-appearance-store";
import { LocalStorageBoardRepository } from "../src/adapters/local-storage-board-repository";
import { DEFAULT_SETTINGS, type SpeechSettings } from "../src/adapters/local-storage-settings-store";
import type { SpeakTarget } from "../src/adapters/local-storage-speak-target-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { DockApp } from "../src/app/DockApp";
import { createFakeFetch, FakeSocket, type RecordedRequest } from "./desktop-fakes";
import { memoryLanguageStore } from "./i18n-helpers";

/** Speech on this device; records what it was asked to say, synchronously. */
export class LocalSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: Array<{ text: string; options: SpeakOptions | undefined }> = [];
  cancelled = 0;
  speak(text: string, options?: SpeakOptions) {
    this.spoken.push({ text, options });
    return Promise.resolve();
  }
  cancel() {
    this.cancelled += 1;
  }
  async listVoices(): Promise<Voice[]> {
    return [
      { id: "alex", name: "Alex", lang: "en-US", isDefault: true },
      { id: "monica", name: "Mónica", lang: "es-ES", isDefault: false },
    ];
  }
  onVoicesChanged() {
    return () => {};
  }
  get texts() {
    return this.spoken.map((entry) => entry.text);
  }
}

const speakKey = (slot: number, text: string, extra: Partial<Key> = {}): Key => ({ slot, ...extra, action: { type: "voice.speak", text } });
export { speakKey };

/** A board with an id and name, from keys; a voice board unless `kind` says otherwise. */
export const boardOf = (id: string, name: string, keys: Key[] = [], kind: BoardKind = "voice"): Board => makeBoard(id, name, kind, keys);

/** An appearance store that starts from `initial` and keeps what is saved in memory. */
export function memoryAppearanceStore(initial: Appearance = DEFAULT_APPEARANCE): AppearanceStore {
  let current = initial;
  return { load: () => current, save: (next) => void (current = next) };
}

export interface LocalSetupOptions {
  /** Boards already on this device; none means a first run (the default board is created). */
  boards?: Board[];
  language?: UiLanguage | null;
  settings?: SpeechSettings;
  appearance?: Appearance;
}

/** App services for phone-only mode, with boards in localStorage. */
export function localServices({ boards, language = "en", settings = DEFAULT_SETTINGS, appearance: initialAppearance }: LocalSetupOptions = {}) {
  if (boards) localStorage.setItem("speed-deck:boards", JSON.stringify({ version: 1, boards }));
  const synthesizer = new LocalSynthesizer();
  let saved = settings;
  let id = 0;
  const appearance = memoryAppearanceStore(initialAppearance);
  const services: AppServices = {
    synthesizer,
    boards: createLocalBoardStore(new LocalStorageBoardRepository(localStorage), () => `board-${++id}`),
    settings: { load: () => saved, save: (next) => void (saved = next) },
    language: memoryLanguageStore(language),
    appearance,
  };
  return { services, synthesizer, appearance, getSettings: () => saved };
}

export function renderLocalApp(options: LocalSetupOptions = {}) {
  const local = localServices(options);
  const view = render(<App services={local.services} />);
  return { ...local, view, user: userEvent.setup() };
}

/** The desktop as the fake fetch sees it: boards, settings and OBS, changed by the requests. */
export interface DesktopState {
  boards: Board[];
  settings: Record<string, unknown>;
  obs: { enabled: boolean; status: string; state: ObsState };
  scenes: string[] | null;
  inputs: string[] | null;
  supportsDeviceSelection: boolean;
  /** Answers for POST /api/actions/execute by action type (default 200 `{ ok: true }`). */
  execute: Record<string, { status?: number; body?: unknown }>;
}

export function desktopState(overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    boards: [buildDefaultBoard("en")],
    settings: {
      voiceId: "",
      rate: 1,
      deviceId: "",
      language: "en",
      captionsVisible: true,
      obs: { enabled: true, host: "127.0.0.1", port: 4455, hasPassword: false },
    },
    obs: { enabled: true, status: "connected", state: { currentScene: "Main", mutedInputs: [], streaming: false, recording: false } },
    scenes: ["Main", "BRB"],
    inputs: ["Mic", "Desktop Audio"],
    supportsDeviceSelection: true,
    execute: {},
    ...overrides,
  };
}

const KEY_PATH = /^\/api\/boards\/([^/]+)\/keys\/(\d+)$/;
const BOARD_PATH = /^\/api\/boards\/([^/]+)$/;

/** Answers desktop API requests from `state`, changing it like the real server would (without validation). */
export function desktopRoute(state: DesktopState) {
  const board = (id: string) => state.boards.find((candidate) => candidate.id === decodeURIComponent(id));
  const replaceBoard = (next: Board) => (state.boards = state.boards.map((candidate) => (candidate.id === next.id ? next : candidate)));
  return (request: RecordedRequest): { status?: number; body?: unknown } | undefined => {
    const route = `${request.method} ${request.url}`;
    const body = (request.body ?? {}) as Record<string, unknown>;
    switch (route) {
      case "GET /api/health":
        return {
          body: { ok: true, name: "speed-deck-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: state.supportsDeviceSelection } },
        };
      case "GET /api/boards":
        return { body: state.boards };
      case "POST /api/boards": {
        const created = makeBoard(`new-${state.boards.length}`, String(body.name), body.kind as BoardKind);
        state.boards = [...state.boards, created];
        return { status: 201, body: created };
      }
      case "POST /api/boards/restore-default": {
        const language = body.language as UiLanguage;
        const fresh = body.boardId === DEFAULT_DECK_BOARD_ID ? buildDefaultDeckBoard(language) : buildDefaultBoard(language);
        state.boards = state.boards.some((candidate) => candidate.id === fresh.id)
          ? state.boards.map((candidate) => (candidate.id === fresh.id ? fresh : candidate))
          : [fresh, ...state.boards];
        return { body: fresh };
      }
      case "GET /api/voices":
        return { body: [{ id: "Alex", name: "Alex", lang: "en-US", isDefault: false }] };
      case "GET /api/devices":
        return { body: [{ id: "BlackHole 2ch", name: "BlackHole 2ch" }] };
      case "GET /api/settings":
        return { body: state.settings };
      case "PUT /api/settings": {
        const { obs, ...rest } = body as { obs?: Record<string, unknown> };
        const currentObs = state.settings.obs as Record<string, unknown>;
        const nextObs = obs ? { ...currentObs, ...obs, hasPassword: obs.password !== undefined ? obs.password !== "" : currentObs.hasPassword } : currentObs;
        delete (nextObs as { password?: unknown }).password;
        state.settings = { ...state.settings, ...rest, obs: nextObs };
        return { body: state.settings };
      }
      case "POST /api/speak":
        return { status: 202, body: { ok: true } };
      case "POST /api/stop":
        return { body: { ok: true } };
      case "POST /api/actions/execute": {
        const type = (body.action as { type: string }).type;
        return state.execute[type] ?? { status: type.startsWith("voice.speak") ? 202 : 200, body: { ok: true } };
      }
      case "GET /api/obs/status":
        return { body: state.obs };
      case "GET /api/obs/scenes":
        return state.scenes ? { body: state.scenes } : { status: 409, body: { error: "OBS is not connected.", code: "obs-unavailable" } };
      case "GET /api/obs/inputs":
        return state.inputs
          ? { body: state.inputs.map((name) => ({ name, kind: "coreaudio_input_capture" })) }
          : { status: 409, body: { error: "OBS is not connected.", code: "obs-unavailable" } };
      case "POST /api/obs/connect":
        return { body: { status: "connected" } };
    }
    const keyMatch = KEY_PATH.exec(request.url);
    if (keyMatch) {
      const target = board(keyMatch[1]!);
      const slot = Number(keyMatch[2]);
      if (!target) return { status: 404, body: { error: "Board not found.", code: "board-not-found" } };
      if (request.method === "PUT") {
        const { replace, ...key } = body as { replace?: boolean } & Omit<Key, "slot">;
        if (!replace && target.keys.some((candidate) => candidate.slot === slot)) return { status: 409, body: { error: "Taken.", code: "slot-occupied" } };
        const stored: Key = { slot, ...(key.label ? { label: key.label } : {}), ...(key.icon ? { icon: key.icon } : {}), ...(key.color ? { color: key.color } : {}), action: key.action };
        replaceBoard(makeBoard(target.id, target.name, target.kind, [...target.keys.filter((candidate) => candidate.slot !== slot), stored]));
        return { body: stored };
      }
      if (request.method === "DELETE") {
        replaceBoard(makeBoard(target.id, target.name, target.kind, target.keys.filter((candidate) => candidate.slot !== slot)));
        return { status: 204 };
      }
    }
    const moveMatch = /^\/api\/boards\/([^/]+)\/keys\/move$/.exec(request.url);
    if (moveMatch && request.method === "POST") {
      const target = board(moveMatch[1]!)!;
      const { from, to } = body as { from: number; to: number };
      const keys = target.keys.map((key) => (key.slot === from ? { ...key, slot: to } : key.slot === to ? { ...key, slot: from } : key));
      const moved = makeBoard(target.id, target.name, target.kind, keys);
      replaceBoard(moved);
      return { body: moved };
    }
    const boardMatch = BOARD_PATH.exec(request.url);
    if (boardMatch) {
      const target = board(boardMatch[1]!);
      if (!target) return { status: 404, body: { error: "Board not found.", code: "board-not-found" } };
      if (request.method === "PATCH") {
        const renamed = { ...target, name: String(body.name) };
        replaceBoard(renamed);
        return { body: renamed };
      }
      if (request.method === "DELETE") {
        if (state.boards.length === 1) return { status: 409, body: { error: "Last.", code: "last-board" } };
        state.boards = state.boards.filter((candidate) => candidate !== target);
        return { status: 204 };
      }
    }
    return undefined;
  };
}

export interface RemoteSetupOptions {
  state?: DesktopState;
  storedTarget?: SpeakTarget | null;
  /** The page's host name; 127.0.0.1 means the computer itself (OBS settings and Connect allowed). */
  hostname?: string;
  language?: UiLanguage | null;
  /** No desktop answers (e.g. GitHub Pages). */
  noDesktop?: boolean;
}

/** App services for a page served by the desktop, with a fake fetch and WebSocket. */
export function remoteServices({ state = desktopState(), storedTarget = null, hostname = "192.168.1.20", language = "en", noDesktop = false }: RemoteSetupOptions = {}) {
  FakeSocket.instances = [];
  const fake = createFakeFetch(noDesktop ? () => undefined : desktopRoute(state));
  let target = storedTarget;
  const local = localServices({ language, boards: [boardOf("local", "Local board", [speakKey(0, "Local phrase")])] });
  const services: AppServices = {
    ...local.services,
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: `${hostname}:4545`, hostname },
      targetStore: { load: () => target, save: (next) => void (target = next) },
      createQrCode: async () => "data:image/svg+xml,qr",
      copyText: async () => true,
    }),
  };
  /** Sends a server event to every open fake socket. */
  const emit = (event: Record<string, unknown>) => {
    for (const socket of FakeSocket.instances) if (!socket.closed) socket.emit({ at: 1, ...event });
  };
  return { services, state, requests: fake.requests, local: local.synthesizer, emit, getTarget: () => target };
}

export function renderRemoteApp(options: RemoteSetupOptions = {}) {
  const remote = remoteServices(options);
  const view = render(<App services={remote.services} />);
  return { ...remote, view, user: userEvent.setup() };
}

export function renderDock(options: RemoteSetupOptions = {}) {
  const remote = remoteServices(options);
  const view = render(<DockApp services={remote.services} />);
  return { ...remote, view, user: userEvent.setup() };
}

/** Requests other than reads, as "METHOD url". */
export function writes(requests: readonly RecordedRequest[]): string[] {
  return requests.filter((request) => request.method !== "GET").map((request) => `${request.method} ${request.url}`);
}

/** Makes `matchMedia` answer `matches` for every query (jsdom has no layout). */
export function setWideScreen(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
