import {
  createPhrase,
  DESKTOP_SERVER_NAME,
  InvalidPhraseError,
  listPhrases,
  MAX_SPEAK_TEXT_LENGTH,
  type HealthResponse,
  type Phrase,
  type PhraseRepository,
  type ServerEvent,
} from "@speak-bot/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces as osNetworkInterfaces } from "node:os";
import { InvalidSettingsError, isValidRate, type JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import type { DesktopSpeakOptions, DesktopSpeechSynthesizer } from "../adapters/tts/process-speech-synthesizer";
import { asObject, HttpError, readJsonBody, sendEmpty, sendJson } from "./http-utils";
import { connectionInfo, type NetworkInterfaces } from "./network";

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
}

const MAX_LABEL_LENGTH = 100;

/** Handles `/api/*` requests. Returns false when the path is not an API path. */
export function createApiHandler(deps: ApiDependencies) {
  const { repository, settings, synthesizer, broadcast, generateId, now } = deps;
  const log = deps.log ?? (() => {});
  const listInterfaces = deps.networkInterfaces ?? osNetworkInterfaces;
  // Only the latest utterance may report "end", so a cancelled one never hides a newer caption.
  let speechRequest = 0;

  const routes: Record<string, (request: IncomingMessage, response: ServerResponse, param?: string) => Promise<void>> = {
    "GET /api/health": async (_request, response) => {
      const body: HealthResponse = { ok: true, name: DESKTOP_SERVER_NAME, capabilities: synthesizer.capabilities, instanceId: deps.instanceId };
      sendJson(response, 200, body);
    },

    "GET /api/connection": async (request, response) => {
      // The port the request actually arrived on, which may differ from the configured one after a fallback.
      sendJson(response, 200, connectionInfo(request.socket.localPort ?? 0, listInterfaces()));
    },

    "GET /api/phrases": async (_request, response) => {
      sendJson(response, 200, await listPhrases(repository));
    },

    "POST /api/phrases": async (request, response) => {
      const body = asObject(await readJsonBody(request));
      const phrase = parsePhrase(body, generateId, now);
      await repository.save(phrase);
      broadcast({ type: "phrases-changed", at: now() });
      sendJson(response, 201, phrase);
    },

    "DELETE /api/phrases/:id": async (_request, response, id) => {
      await repository.delete(id!);
      broadcast({ type: "phrases-changed", at: now() });
      sendEmpty(response, 204);
    },

    "POST /api/speak": async (request, response) => {
      const body = asObject(await readJsonBody(request));
      const { text, phraseId } = await resolveSpeakText(body, repository);
      const options = await speakOptions(body, settings);

      const current = ++speechRequest;
      broadcast(phraseId ? { type: "caption", text, phraseId, at: now() } : { type: "caption", text, at: now() });
      broadcast({ type: "speaking", state: "start", at: now() });
      synthesizer
        .speak(text, options)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          log(`Speech failed: ${message}`);
          if (current === speechRequest) broadcast({ type: "speak-error", message, at: now() });
        })
        .finally(() => {
          if (current === speechRequest) broadcast({ type: "speaking", state: "end", at: now() });
        });
      sendJson(response, 202, { ok: true });
    },

    "POST /api/stop": async (_request, response) => {
      speechRequest += 1;
      synthesizer.cancel();
      broadcast({ type: "speaking", state: "end", at: now() });
      sendJson(response, 200, { ok: true });
    },

    "GET /api/voices": async (_request, response) => {
      sendJson(response, 200, await synthesizer.listVoices());
    },

    "GET /api/devices": async (_request, response) => {
      sendJson(response, 200, await synthesizer.listDevices());
    },

    "GET /api/settings": async (_request, response) => {
      sendJson(response, 200, await settings.load());
    },

    "PUT /api/settings": async (request, response) => {
      sendJson(response, 200, await settings.update(await readJsonBody(request)));
    },
  };

  return async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return false;
    const method = request.method ?? "GET";
    try {
      const phraseMatch = /^\/api\/phrases\/([^/]+)$/.exec(pathname);
      const key = phraseMatch ? `${method} /api/phrases/:id` : `${method} ${pathname}`;
      const route = routes[key];
      if (!route) throw new HttpError(404, "Not found.");
      await route(request, response, phraseMatch ? decodeURIComponent(phraseMatch[1]!) : undefined);
    } catch (error) {
      if (response.headersSent) return true;
      if (error instanceof HttpError) sendJson(response, error.status, { error: error.message });
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

function parsePhrase(body: Record<string, unknown>, generateId: () => string, now: () => number): Phrase {
  const { id, text, label, createdAt } = body;
  if (typeof text !== "string") throw new HttpError(400, "text must be a string.");
  if (text.length > MAX_SPEAK_TEXT_LENGTH) throw new HttpError(400, `text must be at most ${MAX_SPEAK_TEXT_LENGTH} characters.`);
  if (id !== undefined && (typeof id !== "string" || id.length > 100)) throw new HttpError(400, "id must be a string.");
  if (label !== undefined && (typeof label !== "string" || label.length > MAX_LABEL_LENGTH)) {
    throw new HttpError(400, "label must be a short string.");
  }
  if (createdAt !== undefined && (typeof createdAt !== "number" || !Number.isFinite(createdAt))) {
    throw new HttpError(400, "createdAt must be a number.");
  }
  return createPhrase({
    id: id ?? generateId(),
    text,
    label,
    createdAt: createdAt ?? now(),
  });
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

/** Request overrides win; otherwise the saved desktop settings apply. */
async function speakOptions(body: Record<string, unknown>, settings: JsonFileSettingsStore): Promise<DesktopSpeakOptions> {
  const { voiceId, rate } = body;
  if (voiceId !== undefined && (typeof voiceId !== "string" || voiceId.length > 200)) {
    throw new HttpError(400, "voiceId must be a string.");
  }
  if (rate !== undefined && !isValidRate(rate)) throw new HttpError(400, "rate must be a number between 0.5 and 2.");

  const saved = await settings.load();
  const options: DesktopSpeakOptions = {};
  const voice = voiceId ?? saved.voiceId;
  if (voice) options.voiceId = voice;
  options.rate = rate ?? saved.rate;
  if (saved.deviceId) options.deviceId = saved.deviceId;
  return options;
}
