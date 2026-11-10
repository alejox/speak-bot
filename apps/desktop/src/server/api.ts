import {
  createPhrase,
  DEFAULT_PHRASES_BY_LANGUAGE,
  DESKTOP_SERVER_NAME,
  InvalidPhraseError,
  isUiLanguage,
  isValidSlot,
  listPhrases,
  lowestFreeSlot,
  PhraseNotFoundError,
  SlotOccupiedError,
  updatePhrase,
  voiceLanguageOf,
  type PhraseChanges,
  MAX_SPEAK_TEXT_LENGTH,
  pickVoiceForLanguage,
  restoreDefaultPhrases,
  type DesktopSettings,
  type HealthResponse,
  type Phrase,
  type PhraseRepository,
  type ServerEvent,
  type SpeakErrorCode,
  type Voice,
} from "@speak-bot/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces as osNetworkInterfaces } from "node:os";
import { InvalidSettingsError, isValidRate, type JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import {
  SpeechEngineUnavailableError,
  type DesktopSpeakOptions,
  type DesktopSpeechSynthesizer,
} from "../adapters/tts/process-speech-synthesizer";
import { asObject, HttpError, readJsonBody, sendEmpty, sendJson } from "./http-utils";
import { connectionInfo, isLoopbackAddress, type NetworkInterfaces } from "./network";

export interface ApiDependencies {
  repository: PhraseRepository;
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
  /** Called after settings are saved through the API (e.g. to translate the tray menu). */
  onSettingsChanged?: (settings: DesktopSettings) => void;
}

const MAX_LABEL_LENGTH = 100;

/** Handles `/api/*` requests. Returns false when the path is not an API path. */
export function createApiHandler(deps: ApiDependencies) {
  const { repository, settings, synthesizer, broadcast, generateId, now } = deps;
  const log = deps.log ?? (() => {});
  const listInterfaces = deps.networkInterfaces ?? osNetworkInterfaces;
  // Only the latest utterance may report "end", so a cancelled one never hides a newer caption.
  let speechRequest = 0;
  // What POST /api/repeat says again; kept in memory only, so nothing spoken is written to disk.
  let lastSpokenText: string | undefined;
  // Listing system voices spawns a process, so a non-empty list is kept for the server's lifetime.
  let cachedVoices: Promise<Voice[]> | undefined;
  const listVoices = (): Promise<Voice[]> => {
    cachedVoices ??= synthesizer.listVoices().then((voices) => {
      if (voices.length === 0) cachedVoices = undefined;
      return voices;
    });
    return cachedVoices;
  };

  const routes: Record<string, (request: IncomingMessage, response: ServerResponse, param?: string) => Promise<void>> = {
    "GET /api/health": async (_request, response) => {
      const body: HealthResponse = { ok: true, name: DESKTOP_SERVER_NAME, capabilities: synthesizer.capabilities, instanceId: deps.instanceId };
      sendJson(response, 200, body);
    },

    "GET /api/connection": async (request, response) => {
      // Only the desktop's own window needs these URLs; phones on the LAN are refused.
      if (!isLoopbackAddress(request.socket.remoteAddress)) throw new HttpError(403, "Only available on this computer.");
      // The port the request actually arrived on, which may differ from the configured one after a fallback.
      sendJson(response, 200, connectionInfo(request.socket.localPort ?? 0, listInterfaces()));
    },

    "GET /api/phrases": async (_request, response) => {
      sendJson(response, 200, await listPhrases(repository));
    },

    "POST /api/phrases": async (request, response) => {
      const body = asObject(await readJsonBody(request));
      const phrase = parsePhrase(body, await listPhrases(repository), generateId, now);
      await repository.save(phrase);
      broadcast({ type: "phrases-changed", at: now() });
      sendJson(response, 201, phrase);
    },

    /** Replaces every phrase with the default set in `language` ("es" or "en"). */
    "POST /api/phrases/restore": async (request, response) => {
      const { language } = asObject(await readJsonBody(request));
      if (!isUiLanguage(language)) throw new HttpError(400, 'language must be "es" or "en".');
      const restored = await restoreDefaultPhrases({ repository, generateId, now }, DEFAULT_PHRASES_BY_LANGUAGE[language]);
      broadcast({ type: "phrases-changed", at: now() });
      sendJson(response, 200, restored);
    },

    /** Changes the text, label or slot of a phrase; fields left out keep their value. */
    "PUT /api/phrases/:id": async (request, response, id) => {
      const changes = parsePhraseChanges(asObject(await readJsonBody(request)));
      const updated = await updatePhrase(repository, id!, changes);
      broadcast({ type: "phrases-changed", at: now() });
      sendJson(response, 200, updated);
    },

    "DELETE /api/phrases/:id": async (_request, response, id) => {
      await repository.delete(id!);
      broadcast({ type: "phrases-changed", at: now() });
      sendEmpty(response, 204);
    },

    "POST /api/speak": async (request, response) => {
      const body = asObject(await readJsonBody(request));
      const { text, phraseId } = await resolveSpeakText(body, repository);
      startSpeech(text, phraseId, await speakOptions(body, settings, listVoices));
      sendJson(response, 202, { ok: true });
    },

    /** Says the last spoken text again with the saved settings. */
    "POST /api/repeat": async (request, response) => {
      // Required JSON body: like /api/speak, it must not be triggerable by a plain cross-site form.
      asObject(await readJsonBody(request));
      if (lastSpokenText === undefined) {
        sendJson(response, 404, { error: "Nothing has been spoken yet.", code: "nothing-to-repeat" });
        return;
      }
      startSpeech(lastSpokenText, undefined, await speakOptions({}, settings, listVoices));
      sendJson(response, 202, { ok: true });
    },

    /** Hides the current OBS caption right away. */
    "POST /api/captions/clear": async (request, response) => {
      asObject(await readJsonBody(request));
      broadcast({ type: "caption-clear", at: now() });
      sendJson(response, 200, { ok: true });
    },

    "POST /api/stop": async (_request, response) => {
      speechRequest += 1;
      synthesizer.cancel();
      broadcast({ type: "speaking", state: "end", at: now() });
      sendJson(response, 200, { ok: true });
    },

    "GET /api/voices": async (_request, response) => {
      sendJson(response, 200, await listVoices());
    },

    "GET /api/devices": async (_request, response) => {
      sendJson(response, 200, await synthesizer.listDevices());
    },

    "GET /api/settings": async (_request, response) => {
      sendJson(response, 200, await settings.load());
    },

    "PUT /api/settings": async (request, response) => {
      const patch = await readJsonBody(request);
      const updated = await settings.update(patch);
      if (typeof (patch as { captionsVisible?: unknown }).captionsVisible === "boolean") {
        broadcast({ type: "captions-visibility", visible: updated.captionsVisible, at: now() });
      }
      deps.onSettingsChanged?.(updated);
      sendJson(response, 200, updated);
    },
  };

  function startSpeech(text: string, phraseId: string | undefined, options: DesktopSpeakOptions): void {
    const current = ++speechRequest;
    lastSpokenText = text;
    broadcast(phraseId ? { type: "caption", text, phraseId, at: now() } : { type: "caption", text, at: now() });
    broadcast({ type: "speaking", state: "start", at: now() });
    synthesizer
      .speak(text, options)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log(`Speech failed: ${message}`);
        const code: SpeakErrorCode = error instanceof SpeechEngineUnavailableError ? "engine-unavailable" : "speech-failed";
        if (current === speechRequest) broadcast({ type: "speak-error", message, code, at: now() });
      })
      .finally(() => {
        if (current === speechRequest) broadcast({ type: "speaking", state: "end", at: now() });
      });
  }

  return async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return false;
    const method = request.method ?? "GET";
    try {
      // Exact routes (e.g. POST /api/phrases/restore) win over the `:id` pattern.
      const exact = routes[`${method} ${pathname}`];
      const phraseMatch = exact ? null : /^\/api\/phrases\/([^/]+)$/.exec(pathname);
      const route = exact ?? (phraseMatch ? routes[`${method} /api/phrases/:id`] : undefined);
      if (!route) throw new HttpError(404, "Not found.");
      await route(request, response, phraseMatch ? decodeURIComponent(phraseMatch[1]!) : undefined);
    } catch (error) {
      if (response.headersSent) return true;
      if (error instanceof HttpError) sendJson(response, error.status, { error: error.message });
      else if (error instanceof SlotOccupiedError) sendJson(response, 409, { error: error.message, code: "slot-occupied" });
      else if (error instanceof PhraseNotFoundError) sendJson(response, 404, { error: error.message, code: "phrase-not-found" });
      else if (error instanceof InvalidPhraseError || error instanceof InvalidSettingsError) {
        sendJson(response, 400, { error: error.message });
      } else {
        log(`Unexpected error on ${method} ${pathname}: ${String(error)}`);
        sendJson(response, 500, { error: "Internal server error." });
      }
    }
    return true;
  };
}

/**
 * Builds the phrase for POST /api/phrases. Saving an existing id replaces it, keeping its slot unless
 * a new one is given; a new phrase without a slot goes to the lowest free slot.
 */
function parsePhrase(body: Record<string, unknown>, existing: Phrase[], generateId: () => string, now: () => number): Phrase {
  const { id, text, label, createdAt, slot } = body;
  if (typeof text !== "string") throw new HttpError(400, "text must be a string.");
  if (text.length > MAX_SPEAK_TEXT_LENGTH) throw new HttpError(400, `text must be at most ${MAX_SPEAK_TEXT_LENGTH} characters.`);
  if (id !== undefined && (typeof id !== "string" || id.length > 100)) throw new HttpError(400, "id must be a string.");
  if (label !== undefined && (typeof label !== "string" || label.length > MAX_LABEL_LENGTH)) {
    throw new HttpError(400, "label must be a short string.");
  }
  if (createdAt !== undefined && (typeof createdAt !== "number" || !Number.isFinite(createdAt))) {
    throw new HttpError(400, "createdAt must be a number.");
  }
  if (slot !== undefined && !isValidSlot(slot)) throw new HttpError(400, "slot must be a non-negative integer.");

  const phraseId = id ?? generateId();
  const others = existing.filter((phrase) => phrase.id !== phraseId);
  const previous = existing.find((phrase) => phrase.id === phraseId);
  const target = slot ?? previous?.slot ?? lowestFreeSlot(others);
  if (others.some((phrase) => phrase.slot === target)) throw new SlotOccupiedError(target);
  return createPhrase({ id: phraseId, text, label, slot: target, createdAt: createdAt ?? now() });
}

function parsePhraseChanges(body: Record<string, unknown>): PhraseChanges {
  const { text, label, slot } = body;
  const changes: PhraseChanges = {};
  if (text !== undefined) {
    if (typeof text !== "string") throw new HttpError(400, "text must be a string.");
    if (text.length > MAX_SPEAK_TEXT_LENGTH) throw new HttpError(400, `text must be at most ${MAX_SPEAK_TEXT_LENGTH} characters.`);
    changes.text = text;
  }
  if (label !== undefined) {
    if (typeof label !== "string" || label.length > MAX_LABEL_LENGTH) throw new HttpError(400, "label must be a short string.");
    changes.label = label;
  }
  if (slot !== undefined) {
    if (!isValidSlot(slot)) throw new HttpError(400, "slot must be a non-negative integer.");
    changes.slot = slot;
  }
  return changes;
}

async function resolveSpeakText(
  body: Record<string, unknown>,
  repository: PhraseRepository,
): Promise<{ text: string; phraseId?: string }> {
  const { text, phraseId } = body;
  if (typeof phraseId === "string") {
    const phrase = (await repository.list()).find((candidate) => candidate.id === phraseId);
    if (!phrase) throw new HttpError(404, "Phrase not found.");
    return { text: phrase.text, phraseId };
  }
  if (typeof text !== "string" || text.trim() === "") throw new HttpError(400, "text or phraseId is required.");
  if (text.length > MAX_SPEAK_TEXT_LENGTH) throw new HttpError(400, `text must be at most ${MAX_SPEAK_TEXT_LENGTH} characters.`);
  return { text: text.trim() };
}

/**
 * Request overrides win; otherwise the saved desktop settings apply. Without any chosen voice, a voice
 * speaking the voice language (by default the interface language) is used, so Spanish text is not
 * read by an English voice.
 */
async function speakOptions(
  body: Record<string, unknown>,
  settings: JsonFileSettingsStore,
  listVoices: () => Promise<Voice[]>,
): Promise<DesktopSpeakOptions> {
  const { voiceId, rate } = body;
  if (voiceId !== undefined && (typeof voiceId !== "string" || voiceId.length > 200)) {
    throw new HttpError(400, "voiceId must be a string.");
  }
  if (rate !== undefined && !isValidRate(rate)) throw new HttpError(400, "rate must be a number between 0.5 and 2.");

  const saved = await settings.load();
  const options: DesktopSpeakOptions = {};
  const voice = voiceId || saved.voiceId || pickVoiceForLanguage(await listVoices(), voiceLanguageOf(saved))?.id;
  if (voice) options.voiceId = voice;
  options.rate = rate ?? saved.rate;
  if (saved.deviceId) options.deviceId = saved.deviceId;
  return options;
}
