import { COMPOSING_TIMEOUT_MS, type ServerEvent } from "@speed-deck/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createActionExecutor } from "../src/server/action-executor";
import { FakeSynthesizer } from "./fake-synthesizer";

function executorWithEvents() {
  const events: ServerEvent[] = [];
  const executor = createActionExecutor({
    // Composing never reads the settings.
    settings: {} as JsonFileSettingsStore,
    synthesizer: new FakeSynthesizer(),
    broadcast: (event) => events.push(event),
    now: () => 7,
    log: () => {},
  });
  return { executor, flags: () => events.flatMap((event) => (event.type === "composing" ? [event.composing] : [])) };
}

describe("the composing flag on the desktop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("expires on its own when the client stops refreshing it", () => {
    const { executor, flags } = executorWithEvents();
    executor.setComposing(true);
    vi.advanceTimersByTime(COMPOSING_TIMEOUT_MS - 1);
    expect(flags()).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(flags()).toEqual([true, false]);
  });

  it("stays on while it is refreshed, without telling the clients again", () => {
    const { executor, flags } = executorWithEvents();
    executor.setComposing(true);
    vi.advanceTimersByTime(COMPOSING_TIMEOUT_MS - 1);
    executor.setComposing(true);
    vi.advanceTimersByTime(COMPOSING_TIMEOUT_MS - 1);
    expect(flags()).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(flags()).toEqual([true, false]);
  });

  it("says nothing when it is turned off while already off", () => {
    const { executor, flags } = executorWithEvents();
    executor.setComposing(false);
    expect(flags()).toEqual([]);
  });
});
