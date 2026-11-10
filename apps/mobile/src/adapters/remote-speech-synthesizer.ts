import type { SpeakErrorCode, SpeakOptions, Voice } from "@speak-bot/core";
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

/** Speaks through the desktop computer. Completion is tracked with the desktop WebSocket events. */
export class RemoteSpeechSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  private pending: PendingUtterance | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly api: DesktopApiClient,
    private readonly events: DesktopEventSource,
  ) {}

  speak(text: string, options: SpeakOptions = {}): Promise<void> {
    this.listen();
    this.settle();
    return new Promise((resolve, reject) => {
      const pending: PendingUtterance = { resolve, reject };
      this.pending = pending;
      const request: { text: string; voiceId?: string; rate?: number } = { text };
      if (options.voiceId) request.voiceId = options.voiceId;
      if (options.rate !== undefined) request.rate = options.rate;
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
    this.settle();
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
      if (event.type === "speaking" && event.state === "end") this.settle();
      else if (event.type === "speak-error") this.settle(this.pending, new DesktopSpeechError(event.message, event.code));
    });
  }

  /** Resolves (or rejects) the given utterance, defaulting to the current one. */
  private settle(target: PendingUtterance | undefined = this.pending, error?: Error): void {
    if (!target) return;
    if (this.pending === target) this.pending = undefined;
    if (error) target.reject(error);
    else target.resolve();
  }
}
