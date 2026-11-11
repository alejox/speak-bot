import {
  ApplicationNotListedError,
  ApplicationsUnsupportedError,
  COMPOSING_TIMEOUT_MS,
  MAX_SPEECH_QUEUE,
  ObsUnavailableError,
  pickVoiceForLanguage,
  SpeechQueueFullError,
  voiceLanguageOf,
  type Action,
  type ApplicationLauncher,
  type ActionOf,
  type DesktopSettings,
  type KeyRef,
  type MultiActionStepFailure,
  type ObsController,
  type ServerEvent,
  type SpeakErrorCode,
  type SpeakMode,
  type UiLanguage,
  type Voice,
} from "@speed-deck/core";
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
  /** Opens applications for `system.openApp`; absent means this computer cannot. */
  apps?: ApplicationLauncher;
  /** Waits before a multi-action step; a timer by default. */
  sleep?: (ms: number) => Promise<void>;
}

/** What else an action run needs to know. */
export interface ExecuteOptions {
  /** The key pressed: a multi-action runs once per key at a time, and clients show that key running. */
  key?: KeyRef;
}

/** Per-request speech overrides; anything left out comes from the saved settings. */
export interface SpeechOverrides {
  voiceId?: string;
  rate?: number;
}

/** 202 when speech started in the background, 200 when the action is done. */
export interface ExecuteResult {
  status: 200 | 202;
  /** `ignored`: a multi-action that was already running for the same key, so nothing new started. */
  body: { ok: true; captionsVisible?: boolean; voiceLanguage?: UiLanguage; ignored?: true };
}

/** Runs the actions the desktop owns: voice, captions and OBS. Keeps the speech state for repeat and stop. */
export function createActionExecutor(deps: ActionExecutorDependencies) {
  const { settings, synthesizer, broadcast, now, log } = deps;
  // The utterance being said. One that was cut off (by a newer one or by stop) is marked ended at once, so
  // it never reports an "end" that would hide a newer caption.
  let active: { started: boolean; ended: boolean } | null = null;
  // Utterances asked for and not finished yet: the one being said and those waiting behind it.
  let unfinished = 0;
  // What voice.repeat says again; kept in memory only, so nothing spoken is written to disk.
  let lastSpokenText: string | undefined;
  // Listing system voices spawns a process, so a non-empty list is kept for the server's lifetime.
  let cachedVoices: Promise<Voice[]> | undefined;

  // Multi-actions running now, by run id (see `runMultiAction`).
  const runningSequences = new Set<string>();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // Someone is typing something to say; turned off here when the client stops refreshing it.
  let composingTimer: ReturnType<typeof setTimeout> | undefined;

  /** Notes whether someone is typing (never what); clients hear about it only when it changes. */
  function setComposing(composing: boolean): void {
    const wasComposing = composingTimer !== undefined;
    clearTimeout(composingTimer);
    composingTimer = undefined;
    if (composing) {
      composingTimer = setTimeout(() => setComposing(false), COMPOSING_TIMEOUT_MS);
      // The flag must not keep the process alive.
      composingTimer.unref?.();
    }
    if (composing !== wasComposing) broadcast({ type: "composing", composing, at: now() });
  }

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
    if (saved.voiceOutput && saved.voiceOutput !== "speakers") options.output = saved.voiceOutput;
    return options;
  }

  /**
   * Speaks `text` (already validated) and returns once it started or took its place in the queue. By
   * default it interrupts what is being said and empties the queue; with "queue" it waits its turn. The
   * caption and the "speaking" events go out when the utterance really starts, never for one that is dropped.
   */
  async function speak(text: string, overrides: SpeechOverrides = {}, mode: SpeakMode = "interrupt"): Promise<void> {
    const options = await speakOptions(overrides);
    if (mode === "queue") {
      if (unfinished > MAX_SPEECH_QUEUE) throw new SpeechQueueFullError();
      options.mode = mode;
    }
    const utterance = { started: false, ended: false };
    // An interrupting utterance cuts the current one off without an "end": its own caption follows at once.
    if (mode === "interrupt" && active) active.ended = true;
    options.onStart = () => {
      // Its turn in the queue came: the one before it ends first, so the events stay in order.
      if (active && !active.ended) {
        active.ended = true;
        broadcast({ type: "speaking", state: "end", at: now() });
      }
      active = utterance;
      utterance.started = true;
      lastSpokenText = text;
      // What was being typed is being said now.
      setComposing(false);
      broadcast({ type: "caption", text, at: now() });
      broadcast({ type: "speaking", state: "start", at: now() });
    };
    unfinished += 1;
    synthesizer
      .speak(text, options)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log(`Speech failed: ${message}`);
        const code: SpeakErrorCode = error instanceof SpeechEngineUnavailableError ? "engine-unavailable" : "speech-failed";
        if (utterance.started && !utterance.ended) broadcast({ type: "speak-error", message, code, at: now() });
      })
      .finally(() => {
        unfinished -= 1;
        if (active === utterance) active = null;
        if (!utterance.started || utterance.ended) return;
        utterance.ended = true;
        broadcast({ type: "speaking", state: "end", at: now() });
      });
  }

  /** Stops what is being said and empties the queue. */
  function stop(): void {
    if (active) active.ended = true;
    active = null;
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

  /**
   * Opens an application of this computer. The id comes from a stored key, which a phone on the network may
   * have written, so it is only opened when it is exactly one of the applications listed right now.
   */
  async function openApplication(appId: string): Promise<void> {
    if (!deps.apps) throw new ApplicationsUnsupportedError();
    const listed = (await deps.apps.list()).find((application) => application.id === appId);
    if (!listed) throw new ApplicationNotListedError();
    await deps.apps.open(listed.id);
  }

  /**
   * Starts a multi-action in the background: each step waits its delay, then runs like a key of its own. A step
   * that fails is logged and reported in the "end" event, and the steps after it still run. While a run is going,
   * pressing the same key (or, without a key, sending the same steps) is ignored.
   */
  function runMultiAction(action: ActionOf<"system.multiAction">, key: KeyRef | undefined): ExecuteResult {
    const runId = key ? `${key.boardId}:${key.slot}` : JSON.stringify(action.steps);
    if (runningSequences.has(runId)) return { status: 200, body: { ok: true, ignored: true } };
    runningSequences.add(runId);
    const keyPart = key ? { key: { boardId: key.boardId, slot: key.slot } } : {};
    broadcast({ type: "multi-action", runId, ...keyPart, state: "start", at: now() });
    void (async () => {
      const failures: MultiActionStepFailure[] = [];
      try {
        for (const [index, step] of action.steps.entries()) {
          if (step.delayMs > 0) await sleep(step.delayMs);
          try {
            await execute(step.action);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`Multi-action step ${index + 1} (${step.action.type}) failed: ${message}`);
            failures.push({ index, type: step.action.type, message });
          }
        }
      } finally {
        runningSequences.delete(runId);
        broadcast({ type: "multi-action", runId, ...keyPart, state: "end", failures, at: now() });
      }
    })();
    return { status: 202, body: { ok: true } };
  }

  async function execute(action: Action, { key }: ExecuteOptions = {}): Promise<ExecuteResult> {
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
      case "nav.openFolder":
      case "nav.folderBack":
      // A volume key is a slider: the client sets the volume through the OBS volume route, not by pressing it.
      case "obs.inputVolume":
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
      case "system.openApp":
        await openApplication(action.appId);
        return { status: 200, body: { ok: true } };
      case "system.multiAction":
        return runMultiAction(action, key);
    }
  }

  return { speak, stop, repeat, clearCaption, setComposing, execute, listVoices };
}

export type ActionExecutor = ReturnType<typeof createActionExecutor>;
