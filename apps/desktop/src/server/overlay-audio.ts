import { VOICE_CLIP_ID, type OverlayClipReport, type OverlayCommand } from "@speed-deck/core";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CommandResult, RunningCommand } from "../adapters/tts/command-runner";
import type { VoiceClipSink } from "../adapters/tts/voice-clip-sink";

export interface OverlayAudioOptions {
  /** Folder for rendered clips; created on demand and removed on close. */
  dir: string;
  now: () => number;
  /** How long the overlays have to start a clip before it counts as not played. */
  startTimeoutMs?: number;
  /** A clip that plays longer than this counts as finished, so a lost "ended" report never blocks the queue. */
  maxClipMs?: number;
}

export const DEFAULT_CLIP_START_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_CLIP_MS = 5 * 60_000;

/** Published path of a clip; the id is also its file name. */
export const VOICE_CLIPS_PATH = "/api/voice/clips";

const CLIP_NAME = /^([0-9a-f]{32})\.wav$/;

interface PlayingClip {
  readonly file: string;
  /** Overlays that may still play it; reports from any other socket are ignored. */
  readonly pending: Set<number>;
  started: boolean;
  readonly onStart: () => void;
  readonly finish: (result: CommandResult) => void;
}

/**
 * Plays voice clips on the OBS overlays connected at `/ws?client=overlay`, so OBS mixes the voice as the
 * overlay's own audio source. A clip is sent to every overlay; it starts when the first one starts it and
 * ends when one finishes it, when its overlays disconnect, or after `maxClipMs`. Its file is served only
 * while it plays, at an unguessable path.
 */
export class OverlayAudio implements VoiceClipSink {
  private readonly overlays = new Set<number>();
  private readonly clips = new Map<string, PlayingClip>();
  private readonly listeners = new Set<(connected: boolean) => void>();
  private send: (command: OverlayCommand) => void = () => {};
  private readonly startTimeoutMs: number;
  private readonly maxClipMs: number;

  constructor(private readonly options: OverlayAudioOptions) {
    this.startTimeoutMs = options.startTimeoutMs ?? DEFAULT_CLIP_START_TIMEOUT_MS;
    this.maxClipMs = options.maxClipMs ?? DEFAULT_MAX_CLIP_MS;
  }

  /** Where clip commands go: every overlay socket. */
  bind(send: (command: OverlayCommand) => void): void {
    this.send = send;
  }

  /** Notifies when the first overlay connects or the last one leaves. Returns an unsubscribe function. */
  onConnectedChange(listener: (connected: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get connected(): boolean {
    return this.overlays.size > 0;
  }

  overlayConnected(overlay: number): void {
    const was = this.connected;
    this.overlays.add(overlay);
    if (!was) this.notify();
  }

  overlayDisconnected(overlay: number): void {
    if (!this.overlays.delete(overlay)) return;
    for (const [id, clip] of this.clips) {
      if (!clip.pending.delete(overlay) || clip.pending.size > 0) continue;
      // Its last overlay left: a started clip is over, one never started was not played.
      this.end(id, clip.started ? ok() : notPlayed());
    }
    if (!this.connected) this.notify();
  }

  report(overlay: number, report: OverlayClipReport): void {
    const clip = this.clips.get(report.id);
    if (!clip || !clip.pending.has(overlay)) return;
    if (report.type === "clip-started") {
      if (clip.started) return;
      clip.started = true;
      clip.onStart();
    } else if (report.type === "clip-ended") {
      this.end(report.id, ok());
    } else {
      clip.pending.delete(overlay);
      if (clip.pending.size === 0) this.end(report.id, clip.started ? ok() : notPlayed());
    }
  }

  /** The file of a clip being played, for `GET /api/voice/clips/<id>.wav`; null for anything else. */
  clipFile(name: string): string | null {
    const id = CLIP_NAME.exec(name)?.[1];
    return id ? (this.clips.get(id)?.file ?? null) : null;
  }

  async reserve(extension: string): Promise<string> {
    await mkdir(this.options.dir, { recursive: true });
    return join(this.options.dir, `${randomBytes(16).toString("hex")}.${extension}`);
  }

  play(file: string, onStart: () => void): RunningCommand {
    const id = basename(file).split(".")[0]!;
    if (!VOICE_CLIP_ID.test(id)) throw new Error("Clip files must come from reserve().");
    let finish!: (result: CommandResult) => void;
    const result = new Promise<CommandResult>((resolve) => (finish = resolve));
    const clip: PlayingClip = { file, pending: new Set(this.overlays), started: false, onStart, finish };
    this.clips.set(id, clip);

    const startTimer = setTimeout(() => {
      if (!clip.started) this.end(id, notPlayed());
    }, this.startTimeoutMs);
    const expiry = setTimeout(() => this.end(id, ok()), this.maxClipMs);
    startTimer.unref?.();
    expiry.unref?.();
    void result.then(() => {
      clearTimeout(startTimer);
      clearTimeout(expiry);
    });

    if (clip.pending.size === 0) this.end(id, notPlayed());
    else this.send({ type: "voice-clip", id, url: `${VOICE_CLIPS_PATH}/${id}.wav`, at: this.options.now() });
    return {
      result,
      kill: () => {
        if (!this.clips.has(id)) return;
        this.send({ type: "voice-clip-stop", id, at: this.options.now() });
        this.end(id, { code: null, stdout: "", stderr: "" });
      },
    };
  }

  async discard(file: string): Promise<void> {
    await rm(file, { force: true }).catch(() => {});
  }

  /** Stops every clip and deletes the clip folder. */
  async close(): Promise<void> {
    for (const id of [...this.clips.keys()]) this.end(id, { code: null, stdout: "", stderr: "" });
    await rm(this.options.dir, { recursive: true, force: true }).catch(() => {});
  }

  private end(id: string, result: CommandResult): void {
    const clip = this.clips.get(id);
    if (!clip) return;
    this.clips.delete(id);
    clip.finish(result);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener(this.connected);
  }
}

function ok(): CommandResult {
  return { code: 0, stdout: "", stderr: "" };
}

function notPlayed(): CommandResult {
  return { code: 1, stdout: "", stderr: "No OBS overlay played the voice clip." };
}
