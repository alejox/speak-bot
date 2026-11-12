import {
  ApplicationNotListedError,
  ApplicationOpenFailedError,
  ApplicationsUnsupportedError,
  assertKeySlot,
  BoardGridFullError,
  BoardLimitError,
  BoardNotFoundError,
  clearKey,
  createBoard,
  createFolder,
  isValidKeySlot,
  parseBoardId,
  type CreateFolderResponse,
  type KeyRef,
  DEFAULT_BOARD_ID,
  deleteBoard,
  DESKTOP_SERVER_NAME,
  InvalidBoardError,
  isSpeakMode,
  isUiLanguage,
  parseAdsPurchaseReport,
  KeyNotFoundError,
  LastBoardError,
  MAX_OBS_VOLUME_MUL,
  NoRoomForKeyError,
  listBoards,
  MAX_OBS_NAME_LENGTH,
  MAX_SPEAK_TEXT_LENGTH,
  moveKey,
  ObsRequestError,
  ObsUnavailableError,
  parseAction,
  renameBoard,
  restoreDefaultBoard,
  setBoardGrid,
  setKey,
  SlotOccupiedError,
  SpeechQueueFullError,
  type AdResponse,
  type AdsResponse,
  type ApiErrorCode,
  type ApplicationLauncher,
  type BoardRepository,
  type DesktopSettings,
  type HealthResponse,
  type ObsController,
  type ObsInputVolumeResponse,
  type ObsStatusResponse,
  type ServerEvent,
  type VoiceOutputStatusResponse,
} from "@speed-deck/core";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces as osNetworkInterfaces } from "node:os";
import { InvalidSettingsError, isValidRate, toPublicSettings, type JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import type { DesktopSpeechSynthesizer } from "../adapters/tts/process-speech-synthesizer";
import { ClientActionError, createActionExecutor, NothingToRepeatError, type SpeechOverrides } from "./action-executor";
import type { AdFeed } from "../ads/ad-feed";
import type { AdsGrants } from "../ads/ads-grants";
import { applyObsSettings, ObsDisabledError } from "./obs-settings";
import { asObject, HttpError, readJsonBody, sendEmpty, sendJson } from "./http-utils";
import type { OverlayAudio } from "./overlay-audio";
import { connectionInfo, isLoopbackAddress, type NetworkInterfaces } from "./network";

export interface ApiDependencies {
  repository: BoardRepository;
  settings: JsonFileSettingsStore;
  synthesizer: DesktopSpeechSynthesizer;
  broadcast: (event: ServerEvent) => void;
  generateId: () => string;
  now: () => number;
  log?: (message: string) => void;
  /** Lists this computer's network interfaces; defaults to os.networkInterfaces(). */
  networkInterfaces?: () => NetworkInterfaces;
  /** Reported by GET /api/health so the desktop can recognise its own server. */
  instanceId: string;
  /** Stable id of this computer, reported by GET /api/health when set. */
  desktopId?: string;
  /** Called after settings are saved through the API (e.g. to translate the tray menu). */
  onSettingsChanged?: (settings: DesktopSettings) => void;
  /** Controls OBS; absent means OBS control is not available. */
  obs?: ObsController;
  /** Lists and opens the applications of this computer; absent means it cannot. */
  apps?: ApplicationLauncher;
  /** The phones whose "remove ads" purchase removes the ads here; absent means ads always show. */
  adsGrants?: AdsGrants;
  /** The cached sponsor banner; absent means the house banner always shows. */
  ads?: AdFeed;
  /** Plays voice clips on the OBS overlays; absent means the voice only goes to the speakers. */
  overlayAudio?: OverlayAudio;
}

const ADS_SHOWN: AdsResponse = { adsFree: false };

type Params = Record<string, string>;
type Handler = (request: IncomingMessage, response: ServerResponse, params: Params) => Promise<void>;

interface Route {
  method: string;
  /** Path with `:name` segments, e.g. `/api/boards/:id`. */
  path: string;
  handler: Handler;
}

/** Handles `/api/*` requests. Returns false when the path is not an API path. */
export function createApiHandler(deps: ApiDependencies) {
  const { repository, settings, synthesizer, broadcast, generateId, now } = deps;
  const log = deps.log ?? (() => {});
  const listInterfaces = deps.networkInterfaces ?? osNetworkInterfaces;
  // Every client hears about new settings (e.g. the OBS dock follows a language chosen in the window).
  const settingsChanged = (updated: DesktopSettings) => {
    broadcast({ type: "settings-changed", settings: updated, at: now() });
    deps.onSettingsChanged?.(updated);
  };
  const executor = createActionExecutor({
    settings,
    synthesizer,
    broadcast,
    now,
    log,
    onSettingsChanged: settingsChanged,
    obs: deps.obs,
    apps: deps.apps,
  });
  const requireObs = (): ObsController => {
    if (!deps.obs) throw new ObsUnavailableError();
    return deps.obs;
  };
  /** OBS settings hold a password the desktop sends to OBS, so only this computer may change where it goes. */
  const requireLoopback = (request: IncomingMessage) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) throw new LoopbackOnlyError();
  };
  const boardsChanged = () => broadcast({ type: "boards-changed", at: now() });

  // Exact paths are listed before `:param` paths that could also match them.
  const routes: Route[] = [
    {
      method: "GET",
      path: "/api/health",
      handler: async (_request, response) => {
        const body: HealthResponse = {
          ok: true,
          name: DESKTOP_SERVER_NAME,
          capabilities: synthesizer.capabilities,
          instanceId: deps.instanceId,
          ...(deps.desktopId === undefined ? {} : { desktopId: deps.desktopId }),
        };
        sendJson(response, 200, body);
      },
    },
    {
      method: "GET",
      path: "/api/connection",
      handler: async (request, response) => {
        // Only the desktop's own window needs these URLs; phones on the LAN are refused.
        if (!isLoopbackAddress(request.socket.remoteAddress)) throw new HttpError(403, "Only available on this computer.");
        // The port the request actually arrived on, which may differ from the configured one after a fallback.
        sendJson(response, 200, connectionInfo(request.socket.localPort ?? 0, listInterfaces()));
      },
    },

    // ---- Boards ----
    {
      method: "GET",
      path: "/api/boards",
      handler: async (_request, response) => sendJson(response, 200, await listBoards(repository)),
    },
    {
      method: "POST",
      path: "/api/boards",
      handler: async (request, response) => {
        const { name, kind } = asObject(await readJsonBody(request));
        const board = await createBoard({ repository, generateId }, { name, kind });
        boardsChanged();
        sendJson(response, 201, board);
      },
    },
    {
      method: "POST",
      path: "/api/boards/restore-default",
      handler: async (request, response) => {
        const { language, boardId } = asObject(await readJsonBody(request));
        if (!isUiLanguage(language)) throw new HttpError(400, 'language must be "es" or "en".');
        const board = await restoreDefaultBoard(repository, language, boardId ?? DEFAULT_BOARD_ID);
        boardsChanged();
        sendJson(response, 200, board);
      },
    },
    {
      /** Gives every board of one kind one grid, moving keys that no longer fit. */
      method: "PUT",
      path: "/api/boards/grid",
      handler: async (request, response) => {
        const { kind, columns, rows } = asObject(await readJsonBody(request));
        const boards = await setBoardGrid(repository, { kind, columns, rows });
        boardsChanged();
        sendJson(response, 200, boards);
      },
    },
    {
      method: "PATCH",
      path: "/api/boards/:id",
      handler: async (request, response, { id }) => {
        const { name } = asObject(await readJsonBody(request));
        const board = await renameBoard(repository, id!, name);
        boardsChanged();
        sendJson(response, 200, board);
      },
    },
    {
      method: "DELETE",
      path: "/api/boards/:id",
      handler: async (_request, response, { id }) => {
        await deleteBoard(repository, id!);
        boardsChanged();
        sendEmpty(response, 204);
      },
    },
    {
      method: "POST",
      path: "/api/boards/:id/keys/move",
      handler: async (request, response, { id }) => {
        const { from, to } = asObject(await readJsonBody(request));
        assertKeySlot(from);
        assertKeySlot(to);
        const board = await moveKey(repository, id!, from, to);
        boardsChanged();
        sendJson(response, 200, board);
      },
    },
    {
      method: "PUT",
      path: "/api/boards/:id/keys/:slot",
      handler: async (request, response, { id, slot }) => {
        const { label, icon, color, activeColor, span, action, replace } = asObject(await readJsonBody(request));
        if (replace !== undefined && typeof replace !== "boolean") throw new HttpError(400, "replace must be true or false.");
        const key = await setKey(repository, id!, { slot: parseSlot(slot!), label, icon, color, activeColor, span, action }, { replace: replace === true });
        boardsChanged();
        sendJson(response, 200, key);
      },
    },
    {
      /** A folder in a board and the key that opens it, in one step. */
      method: "POST",
      path: "/api/boards/:id/folders",
      handler: async (request, response, { id }) => {
        const { slot, label, icon, color } = asObject(await readJsonBody(request));
        const created: CreateFolderResponse = await createFolder({ repository, generateId }, id!, { slot, label, icon, color });
        boardsChanged();
        sendJson(response, 201, created);
      },
    },
    {
      method: "DELETE",
      path: "/api/boards/:id/keys/:slot",
      handler: async (_request, response, { id, slot }) => {
        await clearKey(repository, id!, parseSlot(slot!));
        boardsChanged();
        sendEmpty(response, 204);
      },
    },

    // ---- Actions and speech ----
    {
      method: "POST",
      path: "/api/actions/execute",
      handler: async (request, response) => {
        const { action, key } = asObject(await readJsonBody(request));
        const parsedKey = key === undefined ? undefined : parseKeyRef(key);
        const result = await executor.execute(parseAction(action), parsedKey ? { key: parsedKey } : {});
        sendJson(response, result.status, result.body);
      },
    },
    {
      method: "POST",
      path: "/api/speak",
      handler: async (request, response) => {
        const body = asObject(await readJsonBody(request));
        const text = parseSpeakText(body.text);
        if (body.mode !== undefined && !isSpeakMode(body.mode)) throw new HttpError(400, 'mode must be "queue" or "interrupt".');
        await executor.speak(text, parseOverrides(body), body.mode);
        sendJson(response, 202, { ok: true });
      },
    },
    {
      /** Someone started or stopped typing something to say: a flag for the overlay, never the text. */
      method: "PUT",
      path: "/api/composing",
      handler: async (request, response) => {
        const { composing } = asObject(await readJsonBody(request));
        if (typeof composing !== "boolean") throw new HttpError(400, "composing must be a boolean.");
        executor.setComposing(composing);
        sendJson(response, 200, { ok: true });
      },
    },
    {
      /** Says the last spoken text again with the saved settings. */
      method: "POST",
      path: "/api/repeat",
      handler: async (request, response) => {
        // Required JSON body: like /api/speak, it must not be triggerable by a plain cross-site form.
        asObject(await readJsonBody(request));
        await executor.repeat();
        sendJson(response, 202, { ok: true });
      },
    },
    {
      /** Hides the current OBS caption right away. */
      method: "POST",
      path: "/api/captions/clear",
      handler: async (request, response) => {
        asObject(await readJsonBody(request));
        executor.clearCaption();
        sendJson(response, 200, { ok: true });
      },
    },
    {
      method: "POST",
      path: "/api/stop",
      handler: async (_request, response) => {
        executor.stop();
        sendJson(response, 200, { ok: true });
      },
    },
    {
      /** Whether an OBS overlay can play the voice right now (for output "obs" or "both"). */
      method: "GET",
      path: "/api/voice/status",
      handler: async (_request, response) => {
        const body: VoiceOutputStatusResponse = { overlayConnected: deps.overlayAudio?.connected ?? false };
        sendJson(response, 200, body);
      },
    },
    {
      /** A voice clip for the overlay; its unguessable name works only while the clip plays. */
      method: "GET",
      path: "/api/voice/clips/:name",
      handler: async (_request, response, { name }) => {
        const file = deps.overlayAudio?.clipFile(name!);
        if (!file) throw new HttpError(404, "No such voice clip.");
        await sendClip(response, file);
      },
    },
    {
      method: "GET",
      path: "/api/voices",
      handler: async (_request, response) => sendJson(response, 200, await executor.listVoices()),
    },
    {
      method: "GET",
      path: "/api/devices",
      handler: async (_request, response) => sendJson(response, 200, await synthesizer.listDevices()),
    },
    {
      method: "GET",
      path: "/api/settings",
      handler: async (_request, response) => sendJson(response, 200, await settings.load()),
    },
    {
      method: "PUT",
      path: "/api/settings",
      handler: async (request, response) => {
        const patch = await readJsonBody(request);
        if (typeof patch === "object" && patch !== null && (patch as { obs?: unknown }).obs !== undefined) requireLoopback(request);
        const stored = await settings.updateStored(patch);
        const updated = toPublicSettings(stored);
        if (typeof (patch as { captionsVisible?: unknown }).captionsVisible === "boolean") {
          broadcast({ type: "captions-visibility", visible: updated.captionsVisible, at: now() });
        }
        // New OBS settings reconnect in the background; the status arrives as obs-status events.
        if (deps.obs && (patch as { obs?: unknown }).obs !== undefined) {
          void applyObsSettings(deps.obs, stored.obs).catch((error: unknown) => log(`Applying OBS settings failed: ${String(error)}`));
        }
        settingsChanged(updated);
        sendJson(response, 200, updated);
      },
    },

    // ---- Whether ads are removed (changes are broadcast as ads-changed by the server) ----
    {
      method: "GET",
      path: "/api/ads",
      handler: async (_request, response) => sendJson(response, 200, (await deps.adsGrants?.status()) ?? ADS_SHOWN),
    },
    {
      /**
       * A phone says whether it owns "remove ads". Paired phones are on the network, so this is not limited
       * to this computer: like pressing keys, anyone the request guard lets in may send it.
       */
      method: "POST",
      path: "/api/ads/report",
      handler: async (request, response) => {
        const report = parseAdsPurchaseReport(asObject(await readJsonBody(request)));
        if (!report) throw new HttpError(400, "deviceId, deviceName and entitlement must be a valid purchase report.");
        sendJson(response, 200, deps.adsGrants ? await deps.adsGrants.report(report) : ADS_SHOWN);
      },
    },

    // ---- Sponsor banner ----
    {
      method: "GET",
      path: "/api/ad",
      handler: async (_request, response) => {
        const body: AdResponse = { ad: (await deps.ads?.current()) ?? null };
        sendJson(response, 200, body);
      },
    },
    {
      method: "GET",
      path: "/api/ad/image",
      handler: async (_request, response) => {
        const image = await deps.ads?.image();
        if (!image) throw new HttpError(404, "No sponsor image.");
        response.writeHead(200, {
          "content-type": image.contentType,
          "content-length": image.bytes.length,
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
        });
        response.end(image.bytes);
      },
    },

    // ---- OBS ----
    {
      method: "GET",
      path: "/api/obs/status",
      handler: async (_request, response) => {
        const { obs } = await settings.loadStored();
        const status = deps.obs?.status() ?? { status: "disconnected" as const };
        const state = deps.obs?.state() ?? { currentScene: null, mutedInputs: [], streaming: false, recording: false };
        const body: ObsStatusResponse = { enabled: obs.enabled, ...status, state };
        sendJson(response, 200, body);
      },
    },
    {
      /** Connects again with the saved settings and answers with the outcome of the first attempt. */
      method: "POST",
      path: "/api/obs/connect",
      handler: async (request, response) => {
        asObject(await readJsonBody(request));
        requireLoopback(request);
        const obs = requireObs();
        const { obs: config } = await settings.loadStored();
        if (!config.enabled) throw new ObsDisabledError();
        sendJson(response, 200, await applyObsSettings(obs, config));
      },
    },
    {
      /** The applications an "open application" key can open; none where the computer cannot open them. */
      method: "GET",
      path: "/api/applications",
      handler: async (_request, response) => sendJson(response, 200, (await deps.apps?.list()) ?? []),
    },
    {
      method: "GET",
      path: "/api/obs/scenes",
      handler: async (_request, response) => sendJson(response, 200, await requireObs().listScenes()),
    },
    {
      method: "GET",
      path: "/api/obs/inputs",
      handler: async (_request, response) => sendJson(response, 200, await requireObs().listInputs()),
    },
    {
      method: "GET",
      path: "/api/obs/inputs/:name/volume",
      handler: async (_request, response, { name }) => {
        const inputName = parseObsName(name!);
        const body: ObsInputVolumeResponse = { inputName, volumeMul: await requireObs().getInputVolume(inputName) };
        sendJson(response, 200, body);
      },
    },
    {
      /** Volume key sliders; anyone who may press keys may move them, like the other OBS actions. */
      method: "PUT",
      path: "/api/obs/inputs/:name/volume",
      handler: async (request, response, { name }) => {
        const inputName = parseObsName(name!);
        const { volumeMul } = asObject(await readJsonBody(request));
        if (typeof volumeMul !== "number" || !Number.isFinite(volumeMul) || volumeMul < 0 || volumeMul > MAX_OBS_VOLUME_MUL) {
          throw new HttpError(400, `volumeMul must be a number from 0 to ${MAX_OBS_VOLUME_MUL}.`);
        }
        await requireObs().setInputVolume(inputName, volumeMul);
        sendJson(response, 200, { ok: true });
      },
    },
    {
      method: "GET",
      path: "/api/obs/scenes/:name/items",
      handler: async (_request, response, { name }) => {
        if (name!.length > MAX_OBS_NAME_LENGTH) throw new HttpError(400, "Scene name is too long.");
        sendJson(response, 200, await requireObs().listSceneItems(name!));
      },
    },
  ];

  return async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return false;
    const method = request.method ?? "GET";
    try {
      const match = matchRoute(routes, method, pathname);
      if (!match) throw new HttpError(404, "Not found.");
      await match.route.handler(request, response, match.params);
    } catch (error) {
      if (response.headersSent) return true;
      const failure = describeFailure(error);
      if (failure) {
        sendJson(response, failure.status, failure.code ? { error: failure.message, code: failure.code } : { error: failure.message });
      } else {
        log(`Unexpected error on ${method} ${pathname}: ${String(error)}`);
        sendJson(response, 500, { error: "Internal server error." });
      }
    }
    return true;
  };
}

async function sendClip(response: ServerResponse, file: string): Promise<void> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    throw new HttpError(404, "No such voice clip.");
  }
  response.writeHead(200, {
    "content-type": "audio/wav",
    "content-length": size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  await new Promise<void>((resolve) => {
    createReadStream(file)
      .on("error", () => {
        response.destroy();
        resolve();
      })
      .on("end", resolve)
      .pipe(response);
  });
}

function matchRoute(routes: readonly Route[], method: string, pathname: string): { route: Route; params: Params } | null {
  const segments = pathname.split("/");
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/");
    if (pattern.length !== segments.length) continue;
    const params: Params = {};
    const matches = pattern.every((part, index) => {
      const segment = segments[index]!;
      if (!part.startsWith(":")) return part === segment;
      if (segment === "") return false;
      try {
        params[part.slice(1)] = decodeURIComponent(segment);
        return true;
      } catch {
        return false;
      }
    });
    if (matches) return { route, params };
  }
  return null;
}

/** The request must come from this computer. */
class LoopbackOnlyError extends Error {
  constructor() {
    super("Only available on this computer.");
    this.name = "LoopbackOnlyError";
  }
}

function describeFailure(error: unknown): { status: number; message: string; code?: ApiErrorCode } | null {
  if (error instanceof LoopbackOnlyError) return { status: 403, message: error.message, code: "loopback-only" };
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  if (error instanceof InvalidBoardError) return { status: 400, message: error.message, code: "invalid-board" };
  if (error instanceof InvalidSettingsError) return { status: 400, message: error.message };
  if (error instanceof ClientActionError) return { status: 400, message: error.message, code: "client-action" };
  if (error instanceof BoardNotFoundError) return { status: 404, message: error.message, code: "board-not-found" };
  if (error instanceof KeyNotFoundError) return { status: 404, message: error.message, code: "key-not-found" };
  if (error instanceof NothingToRepeatError) return { status: 404, message: error.message, code: "nothing-to-repeat" };
  if (error instanceof SlotOccupiedError) return { status: 409, message: error.message, code: "slot-occupied" };
  if (error instanceof NoRoomForKeyError) return { status: 409, message: error.message, code: "no-room" };
  if (error instanceof BoardGridFullError) return { status: 409, message: error.message, code: "grid-full" };
  if (error instanceof SpeechQueueFullError) return { status: 409, message: error.message, code: "queue-full" };
  if (error instanceof BoardLimitError) return { status: 409, message: error.message, code: "board-limit" };
  if (error instanceof LastBoardError) return { status: 409, message: error.message, code: "last-board" };
  if (error instanceof ObsUnavailableError) return { status: 409, message: error.message, code: "obs-unavailable" };
  if (error instanceof ObsDisabledError) return { status: 409, message: error.message, code: "obs-disabled" };
  if (error instanceof ApplicationNotListedError) return { status: 404, message: error.message, code: "app-not-found" };
  if (error instanceof ApplicationsUnsupportedError) return { status: 409, message: error.message, code: "apps-unsupported" };
  if (error instanceof ApplicationOpenFailedError) return { status: 502, message: error.message, code: "app-open-failed" };
  if (error instanceof ObsRequestError) return { status: 502, message: error.message, code: "obs-request-failed" };
  return null;
}

/** An OBS input name from the URL. */
function parseObsName(segment: string): string {
  if (segment.length === 0 || segment.length > MAX_OBS_NAME_LENGTH) throw new HttpError(400, "Input name is empty or too long.");
  return segment;
}

/** A slot from the URL: digits only, range checked by the use cases. */
function parseKeyRef(value: unknown): KeyRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(400, "key must be an object.");
  const { boardId, slot } = value as Record<string, unknown>;
  if (!isValidKeySlot(slot)) throw new HttpError(400, "key.slot must be a key slot.");
  try {
    return { boardId: parseBoardId(boardId), slot };
  } catch {
    throw new HttpError(400, "key.boardId must be a board id.");
  }
}

function parseSlot(segment: string): number {
  if (!/^\d{1,6}$/.test(segment)) throw new HttpError(400, "slot must be a non-negative integer.");
  return Number(segment);
}

function parseSpeakText(text: unknown): string {
  if (typeof text !== "string" || text.trim() === "") throw new HttpError(400, "text is required.");
  if (text.length > MAX_SPEAK_TEXT_LENGTH) throw new HttpError(400, `text must be at most ${MAX_SPEAK_TEXT_LENGTH} characters.`);
  return text.trim();
}

function parseOverrides(body: Record<string, unknown>): SpeechOverrides {
  const { voiceId, rate } = body;
  if (voiceId !== undefined && (typeof voiceId !== "string" || voiceId.length > 200)) {
    throw new HttpError(400, "voiceId must be a string.");
  }
  if (rate !== undefined && !isValidRate(rate)) throw new HttpError(400, "rate must be a number between 0.5 and 2.");
  const overrides: SpeechOverrides = {};
  if (voiceId) overrides.voiceId = voiceId;
  if (rate !== undefined) overrides.rate = rate;
  return overrides;
}
