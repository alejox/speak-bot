import { ObsRequestError, ObsUnavailableError, type Action, type ObsController, type ObsSourceTransform, type ServerEvent } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import type { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createActionExecutor } from "../src/server/action-executor";
import { FakeSynthesizer } from "./fake-synthesizer";

const corner: ObsSourceTransform = { positionX: 1440, positionY: 810, scaleX: 0.25, scaleY: 0.25, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 } };
const move: Action = { type: "obs.moveSource", sceneName: "Main", sourceName: "Cam", transform: corner, durationMs: 300 };

describe("running obs.moveSource", () => {
  const setup = (obs?: Partial<ObsController>) => {
    const events: ServerEvent[] = [];
    const logs: string[] = [];
    const executor = createActionExecutor({
      settings: { load: async () => ({}) } as unknown as JsonFileSettingsStore,
      synthesizer: new FakeSynthesizer(),
      broadcast: (event) => events.push(event),
      now: () => 1000,
      log: (message) => logs.push(message),
      sleep: async () => {},
      ...(obs ? { obs: obs as ObsController } : {}),
    });
    return { executor, events, logs };
  };

  it("asks OBS to move the source to the target over the asked time and answers when it is there", async () => {
    const calls: unknown[][] = [];
    const { executor } = setup({ moveSource: async (...args) => void calls.push(args) });
    expect(await executor.execute(move)).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([["Main", "Cam", corner, 300]]);
  });

  it("fails like the other OBS actions without OBS or when OBS refuses", async () => {
    await expect(setup().executor.execute(move)).rejects.toThrow(ObsUnavailableError);
    const refusing = setup({
      moveSource: async () => {
        throw new ObsRequestError("No scene items were found.");
      },
    });
    await expect(refusing.executor.execute(move)).rejects.toThrow(ObsRequestError);
  });

  it("runs as a step of a multi-action and reports a step that failed", async () => {
    const calls: string[] = [];
    const { executor, events } = setup({
      moveSource: async (_scene, sourceName) => {
        calls.push(sourceName);
        if (sourceName === "Gone") throw new ObsRequestError("No scene items were found.");
      },
    });
    const sequence: Action = {
      type: "system.multiAction",
      steps: [
        { action: { ...move, sourceName: "Gone" }, delayMs: 0 },
        { action: move, delayMs: 100 },
      ],
    };
    expect(await executor.execute(sequence, { key: { boardId: "deck", slot: 1 } })).toEqual({ status: 202, body: { ok: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["Gone", "Cam"]);
    expect(events.at(-1)).toMatchObject({ type: "multi-action", state: "end", failures: [{ index: 0, type: "obs.moveSource", message: "No scene items were found." }] });
  });
});
