import {
  ObsUnavailableError,
  pickVoiceForLanguage,
  voiceLanguageOf,
  type Action,
  type DesktopSettings,
  type ObsController,
  type ServerEvent,
  type SpeakErrorCode,
  type UiLanguage,
  type Voice,
} from "@speak-bot/core";
import type { JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import {
  SpeechEngineUnavailableError,
  type DesktopSpeakOptions,
  type DesktopSpeechSynthesizer,
} from "../adapters/tts/process-speech-synthesizer";

/** Navigation actions run in each client, which keeps its own board and page. */
export class ClientActionError extends Error {
  constructor(readonly type: string) {
    super(`${type} runs in each client, not on the desktop.`);
    this.name = "ClientActionError";
  }
}

export class NothingToRepeatError extends Error {
  constructor() {
    super("Nothing has been spoken yet.");
    this.name = "NothingToRepeatError";
  }
}

export interface ActionExecutorDependencies {
  settings: JsonFileSettingsStore;
  synthesizer: DesktopSpeechSynthesizer;
  broadcast: (event: ServerEvent) => void;
  now: () => number;
  log: (message: string) => void;
  /** Called after an action changed the saved settings. */
  onSettingsChanged?: (settings: DesktopSettings) => void;
  /** Runs `obs.*` actions; absent means OBS control is not available. */
  obs?: ObsController;
}

/** Per-request speech overrides; anything left out comes from the saved settings. */
export interface SpeechOverrides {
  voiceId?: string;
  rate?: number;
}

/** 202 when speech started in the background, 200 when the action is done. */
export interface ExecuteResult {
  status: 200 | 202;
  body: { ok: true; captionsVisible?: boolean; voiceLanguage?: UiLanguage };
}

/** Runs the actions the desktop owns: voice, captions and OBS. Keeps the speech state for repeat and stop. */
export function createActionExecutor(deps: ActionExecutorDependencies) {
  const { settings, synthesizer, broadcast, now, log } = deps;
  // Only the latest utterance may report "end", so a cancelled one never hides a newer caption.
  let speechRequest = 0;
  // What voice.repeat says again; kept in memory only, so nothing spoken is written to disk.
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

  /**
   * Request overrides win; otherwise the saved desktop settings apply. Without any chosen voice, a
   * voice speaking the voice language (by default the interface language) is used.
   */
  async function speakOptions(overrides: SpeechOverrides): Promise<DesktopSpeakOptions> {
    const saved = await settings.load();
    const options: DesktopSpeakOptions = {};
    const voice = overrides.voiceId || saved.voiceId || pickVoiceForLanguage(await listVoices(), voiceLanguageOf(saved))?.id;
    if (voice) options.voiceId = voice;
    options.rate = overrides.rate ?? saved.rate;
    if (saved.deviceId) options.deviceId = saved.deviceId;
    return options;
  }

  /** Starts speaking `text` (already validated) and returns once it started. */
  async function speak(text: string, overrides: SpeechOverrides = {}): Promise<void> {
    const options = await speakOptions(overrides);
    const current = ++speechRequest;
    lastSpokenText = text;
    broadcast({ type: "caption", text, at: now() });
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

  function stop(): void {
    speechRequest += 1;
    synthesizer.cancel();
    broadcast({ type: "speaking", state: "end", at: now() });
  }

  async function repeat(): Promise<void> {
    if (lastSpokenText === undefined) throw new NothingToRepeatError();
    await speak(lastSpokenText);
  }

  function clearCaption(): void {
    broadcast({ type: "caption-clear", at: now() });
  }

  async function saveSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
    const updated = await settings.update(patch);
    deps.onSettingsChanged?.(updated);
    return updated;
  }

  function requireObs(): ObsController {
    if (!deps.obs) throw new ObsUnavailableError();
    return deps.obs;
  }

  async function execute(action: Action): Promise<ExecuteResult> {
    switch (action.type) {
      case "voice.speak":
        await speak(action.text);
        return { status: 202, body: { ok: true } };
      case "voice.repeat":
        await repeat();
        return { status: 202, body: { ok: true } };
      case "voice.stop":
        stop();
        return { status: 200, body: { ok: true } };
      case "voice.toggleLanguage": {
        const current = voiceLanguageOf(await settings.load());
        const updated = await saveSettings({ voiceLanguage: current === "es" ? "en" : "es" });
        return { status: 200, body: { ok: true, voiceLanguage: voiceLanguageOf(updated) } };
      }
      case "captions.clear":
        clearCaption();
        return { status: 200, body: { ok: true } };
      case "captions.toggle": {
        const updated = await saveSettings({ captionsVisible: !(await settings.load()).captionsVisible });
        broadcast({ type: "captions-visibility", visible: updated.captionsVisible, at: now() });
        return { status: 200, body: { ok: true, captionsVisible: updated.captionsVisible } };
      }
      case "nav.nextPage":
      case "nav.prevPage":
      case "nav.goToPage":
      case "nav.goToBoard":
        throw new ClientActionError(action.type);
      case "obs.switchScene":
        await requireObs().switchScene(action.sceneName);
        return { status: 200, body: { ok: true } };
      case "obs.toggleMute":
        await requireObs().toggleMute(action.inputName);
        return { status: 200, body: { ok: true } };
      case "obs.toggleStream":
        await requireObs().toggleStream();
        return { status: 200, body: { ok: true } };
      case "obs.toggleRecord":
        await requireObs().toggleRecord();
        return { status: 200, body: { ok: true } };
      case "obs.toggleSourceVisibility":
        await requireObs().toggleSourceVisibility(action.sceneName, action.sourceName);
        return { status: 200, body: { ok: true } };
    }
  }

  return { speak, stop, repeat, clearCaption, execute, listVoices };
}

export type ActionExecutor = ReturnType<typeof createActionExecutor>;
