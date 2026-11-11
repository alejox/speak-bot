import type { SpeakErrorCode, SpeakOptions, SpeakRequest, Voice } from "@speed-deck/core";
import type { DesktopApiClient } from "./desktop-api";
import type { DesktopEventSource } from "./desktop-events";
import type { AppSpeechSynthesizer } from "./web-speech-synthesizer";

/** The desktop reported that it could not speak (for example, its TTS engine is missing). */
export class DesktopSpeechError extends Error {
  constructor(
    message: string,
    /** Lets the UI explain the failure in its own language. */
    readonly code?: SpeakErrorCode,
  ) {
    super(message);
    this.name = "DesktopSpeechError";
  }
}

interface PendingUtterance {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Speaks through the desktop computer, which keeps the queue. Completion is tracked with the desktop
 * WebSocket events: they do not say which utterance ended, so an "end" settles everything asked so far
 * (the app shows the desktop as speaking from its events, not from these promises).
 */
export class RemoteSpeechSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  private readonly pending = new Set<PendingUtterance>();
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly api: DesktopApiClient,
    private readonly events: DesktopEventSource,
  ) {}

  speak(text: string, options: SpeakOptions = {}): Promise<void> {
    this.listen();
    // An interrupting utterance cuts off the one being said and those waiting behind it.
    if (options.mode !== "queue") this.settleAll();
    return new Promise((resolve, reject) => {
      const pending: PendingUtterance = { resolve, reject };
      this.pending.add(pending);
      const request: SpeakRequest = { text };
      if (options.voiceId) request.voiceId = options.voiceId;
      if (options.rate !== undefined) request.rate = options.rate;
      if (options.mode === "queue") request.mode = options.mode;
      this.api.speak(request).then(
        () => {
          // Without live events there is no "end" to wait for.
          if (!this.events.isConnected) this.settle(pending);
        },
        (error: unknown) => this.settle(pending, error instanceof Error ? error : new Error(String(error))),
      );
    });
  }

  cancel(): void {
    this.settleAll();
    void this.api.stop().catch(() => {});
  }

  listVoices(): Promise<Voice[]> {
    return this.api.listVoices().catch(() => []);
  }

  onVoicesChanged(): () => void {
    return () => {};
  }

  /** Stops listening to desktop events. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private listen(): void {
    this.unsubscribe ??= this.events.subscribe((event) => {
      if (event.type === "speaking" && event.state === "end") this.settleAll();
      else if (event.type === "speak-error") this.settleAll(new DesktopSpeechError(event.message, event.code));
    });
  }

  /** Resolves (or rejects) one utterance, once. */
  private settle(target: PendingUtterance, error?: Error): void {
    if (!this.pending.delete(target)) return;
    if (error) target.reject(error);
    else target.resolve();
  }

  private settleAll(error?: Error): void {
    for (const target of [...this.pending]) this.settle(target, error);
  }
}
