import type { Action, ObsController, ServerEvent } from "@speed-deck/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createActionExecutor } from "../src/server/action-executor";
import { FakeSynthesizer } from "./fake-synthesizer";

const scene: Action = { type: "obs.switchScene", sceneName: "Intro" };
const mute: Action = { type: "obs.toggleMute", inputName: "Mic" };
const record: Action = { type: "obs.toggleRecord" };
const intro: Action = {
  type: "system.multiAction",
  steps: [
    { action: scene, delayMs: 0 },
    { action: mute, delayMs: 1000 },
    { action: record, delayMs: 500 },
  ],
};
const key = { boardId: "deck", slot: 3 };

describe("multi-action runner", () => {
  let calls: string[];
  let events: ServerEvent[];
  let failing: Set<string>;
  let logs: string[];

  const setup = () =>
    createActionExecutor({
      settings: { load: async () => ({}) } as unknown as JsonFileSettingsStore,
      synthesizer: new FakeSynthesizer(),
      broadcast: (event) => events.push(event),
      now: () => 1000,
      log: (message) => logs.push(message),
      obs: {
        switchScene: async (name: string) => step(`scene:${name}`),
        toggleMute: async (name: string) => step(`mute:${name}`),
        toggleRecord: async () => step("record"),
      } as unknown as ObsController,
    });

  const step = async (name: string) => {
    calls.push(name);
    if (failing.has(name)) throw new Error(`${name} failed`);
  };
  const runningEvents = () => events.filter((event) => event.type === "multi-action");

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    events = [];
    failing = new Set();
    logs = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the steps in order, waiting before each one as asked, and reports it running", async () => {
    const executor = setup();
    expect(await executor.execute(intro, { key })).toEqual({ status: 202, body: { ok: true } });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["scene:Intro"]);
    expect(runningEvents()).toEqual([{ type: "multi-action", runId: "deck:3", key, state: "start", at: 1000 }]);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toEqual(["scene:Intro"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["scene:Intro", "mute:Mic"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toEqual(["scene:Intro", "mute:Mic", "record"]);
    expect(runningEvents().at(-1)).toEqual({ type: "multi-action", runId: "deck:3", key, state: "end", failures: [], at: 1000 });
  });

  it("runs the remaining steps after one fails and reports which one did", async () => {
    failing.add("mute:Mic");
    const executor = setup();
    await executor.execute(intro, { key });
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual(["scene:Intro", "mute:Mic", "record"]);
    expect(runningEvents().at(-1)).toMatchObject({
      state: "end",
      failures: [{ index: 1, type: "obs.toggleMute", message: "mute:Mic failed" }],
    });
    expect(logs.join("\n")).toContain("mute:Mic failed");
  });

  it("ignores the key while its sequence runs, and runs it again once it ended", async () => {
    const executor = setup();
    await executor.execute(intro, { key });
    expect(await executor.execute(intro, { key })).toEqual({ status: 200, body: { ok: true, ignored: true } });
    // Another key runs at the same time.
    expect((await executor.execute(intro, { key: { boardId: "deck", slot: 4 } })).status).toBe(202);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls.filter((call) => call === "record")).toHaveLength(2);
    expect((await executor.execute(intro, { key })).status).toBe(202);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls.filter((call) => call === "record")).toHaveLength(3);
  });

  it("tells a sequence without a key apart by its steps", async () => {
    const executor = setup();
    expect((await executor.execute(intro)).status).toBe(202);
    expect((await executor.execute(intro)).body).toEqual({ ok: true, ignored: true });
    expect(runningEvents()[0]).toMatchObject({ state: "start" });
    expect(runningEvents()[0]).not.toHaveProperty("key");
    await vi.advanceTimersByTimeAsync(1500);
  });
});
