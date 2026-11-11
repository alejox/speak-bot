import type { OverlayCommand } from "@speed-deck/core";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayAudio } from "../src/server/overlay-audio";

describe("OverlayAudio", () => {
  let dir: string;
  let audio: OverlayAudio;
  let sent: OverlayCommand[];
  let changes: boolean[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-clips-test-"));
    audio = new OverlayAudio({ dir, startTimeoutMs: 1000, maxClipMs: 10_000, now: () => 7 });
    sent = [];
    changes = [];
    audio.bind((command) => sent.push(command));
    audio.onConnectedChange((connected) => changes.push(connected));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });

  async function playing(overlays: number[] = [1]) {
    for (const overlay of overlays) audio.overlayConnected(overlay);
    const file = await audio.reserve("wav");
    await writeFile(file, "RIFF");
    let started = 0;
    const running = audio.play(file, () => (started += 1));
    const command = sent.at(-1)!;
    return { file, running, id: command.id, started: () => started };
  }

  it("is connected while at least one overlay is, and says so only on changes", () => {
    expect(audio.connected).toBe(false);
    audio.overlayConnected(1);
    audio.overlayConnected(2);
    audio.overlayDisconnected(1);
    expect(audio.connected).toBe(true);
    audio.overlayDisconnected(2);
    expect(audio.connected).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("reserves unguessable WAV file names inside its own folder", async () => {
    const first = await audio.reserve("wav");
    const second = await audio.reserve("wav");
    expect(dirname(first)).toBe(dir);
    expect(basename(first)).toMatch(/^[0-9a-f]{32}\.wav$/);
    expect(first).not.toBe(second);
  });

  it("sends the clip to the overlays and serves its file only while it plays", async () => {
    const { file, running, id, started } = await playing();
    expect(sent).toEqual([{ type: "voice-clip", id, url: `/api/voice/clips/${id}.wav`, at: 7 }]);
    expect(audio.clipFile(`${id}.wav`)).toBe(file);

    audio.report(1, { type: "clip-started", id });
    audio.report(1, { type: "clip-started", id });
    expect(started()).toBe(1);
    audio.report(1, { type: "clip-ended", id });
    expect(await running.result).toMatchObject({ code: 0 });
    expect(audio.clipFile(`${id}.wav`)).toBeNull();
  });

  it("refuses unknown, malformed or path-like clip names", async () => {
    const { id } = await playing();
    expect(audio.clipFile(`${"0".repeat(32)}.wav`)).toBeNull();
    expect(audio.clipFile(id)).toBeNull();
    expect(audio.clipFile(`../${id}.wav`)).toBeNull();
    expect(audio.clipFile(`${id.toUpperCase()}.wav`)).toBeNull();
  });

  it("kill stops the clip on the overlays and resolves as cancelled", async () => {
    const { running, id } = await playing();
    running.kill();
    expect(sent.at(-1)).toEqual({ type: "voice-clip-stop", id, at: 7 });
    expect(await running.result).toMatchObject({ code: null });
    expect(audio.clipFile(`${id}.wav`)).toBeNull();
  });

  it("fails when no overlay starts the clip in time", async () => {
    vi.useFakeTimers();
    const { running } = await playing();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await running.result).code).toBe(1);
  });

  it("expires a clip that plays longer than the longest allowed", async () => {
    vi.useFakeTimers();
    const { running, id } = await playing();
    audio.report(1, { type: "clip-started", id });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await running.result).code).toBe(0);
    expect(audio.clipFile(`${id}.wav`)).toBeNull();
  });

  it("fails only when every overlay failed; another one playing it is enough", async () => {
    const one = await playing([1, 2]);
    audio.report(1, { type: "clip-failed", id: one.id });
    audio.report(2, { type: "clip-started", id: one.id });
    audio.report(2, { type: "clip-ended", id: one.id });
    expect((await one.running.result).code).toBe(0);

    const two = await playing();
    audio.report(1, { type: "clip-failed", id: two.id });
    audio.report(2, { type: "clip-failed", id: two.id });
    expect((await two.running.result).code).toBe(1);
  });

  it("finishes the clip when its overlays disconnect, and ignores reports from others", async () => {
    const { running, id } = await playing();
    audio.report(9, { type: "clip-failed", id });
    audio.report(1, { type: "clip-started", id });
    audio.overlayDisconnected(1);
    expect((await running.result).code).toBe(0);
  });

  it("discards clip files and removes its folder on close", async () => {
    const file = await audio.reserve("wav");
    await writeFile(file, "RIFF");
    await audio.discard(file);
    await expect(stat(file)).rejects.toThrow();
    await audio.close();
    await expect(stat(dir)).rejects.toThrow();
  });
});
