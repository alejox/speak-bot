import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  actionsOf,
  createKey,
  InvalidBoardError,
  isKeyActionAllowedOnBoard,
  isMultiActionStepType,
  makeBoard,
  MAX_MULTI_ACTION_STEPS,
  MAX_STEP_DELAY_MS,
  parseAction,
  readStoredBoards,
  setKey,
  type Action,
  type ActionType,
} from "../src/index";
import { InMemoryBoardRepository } from "./fakes";

const scene: Action = { type: "obs.switchScene", sceneName: "Intro" };
const mute: Action = { type: "obs.toggleMute", inputName: "Mic" };
const record: Action = { type: "obs.toggleRecord" };
const multi = (steps: unknown[]) => ({ type: "system.multiAction", steps });

describe("multi-action", () => {
  it("is a Deck action the desktop runs, with no fields of its own", () => {
    const definition = ACTION_REGISTRY["system.multiAction"];
    expect(definition).toMatchObject({ category: "system", runsOn: "server", requiresDesktop: true, requiresObs: false, params: [], userSelectable: true });
  });

  it("reads 2 to 10 steps, each an action with a wait before it (0 when left out)", () => {
    const action = parseAction(multi([{ action: scene, delayMs: 0 }, { action: { ...mute, extra: 1 }, delayMs: 1000 }, { action: record }]));
    expect(action).toEqual({
      type: "system.multiAction",
      steps: [
        { action: scene, delayMs: 0 },
        { action: mute, delayMs: 1000 },
        { action: record, delayMs: 0 },
      ],
    });
    expect(actionsOf(action)).toEqual([scene, mute, record]);
    expect(actionsOf(record)).toEqual([record]);
    const ten = Array.from({ length: MAX_MULTI_ACTION_STEPS }, () => ({ action: record, delayMs: MAX_STEP_DELAY_MS }));
    expect(parseAction(multi(ten))).toMatchObject({ steps: ten });
  });

  it("refuses too few or too many steps, bad waits and invalid step actions", () => {
    const bad: unknown[] = [
      multi([{ action: scene }]),
      multi(Array.from({ length: MAX_MULTI_ACTION_STEPS + 1 }, () => ({ action: record }))),
      { type: "system.multiAction" },
      multi([{ action: scene, delayMs: -1 }, { action: record }]),
      multi([{ action: scene, delayMs: MAX_STEP_DELAY_MS + 1 }, { action: record }]),
      multi([{ action: scene, delayMs: 0.5 }, { action: record }]),
      multi([{ action: scene, delayMs: "1" }, { action: record }]),
      multi([{ action: { type: "obs.switchScene" } }, { action: record }]),
      multi(["obs.toggleRecord", { action: record }]),
    ];
    for (const value of bad) expect(() => parseAction(value), JSON.stringify(value)).toThrow(InvalidBoardError);
  });

  it("refuses navigation, folders, volume sliders and another multi-action as steps", () => {
    const forbidden: Action[] = [
      { type: "nav.nextPage" },
      { type: "nav.prevPage" },
      { type: "nav.goToPage", page: 2 },
      { type: "nav.goToBoard", boardId: "b" },
      { type: "nav.openFolder", folderId: "f" },
      { type: "nav.folderBack" },
      { type: "obs.inputVolume", inputName: "Mic" },
      { type: "system.multiAction", steps: [{ action: record, delayMs: 0 }, { action: record, delayMs: 0 }] },
    ];
    for (const action of forbidden) {
      expect(isMultiActionStepType(action.type)).toBe(false);
      expect(() => parseAction(multi([{ action }, { action: record }])), action.type).toThrow(InvalidBoardError);
    }
    const allowed: ActionType[] = ["obs.switchScene", "obs.toggleRecord", "system.openApp", "voice.speak", "captions.clear"];
    for (const type of allowed) expect(isMultiActionStepType(type)).toBe(true);
  });

  it("sits on Deck boards only, and only with steps a Deck board allows", async () => {
    const deckSteps = parseAction(multi([{ action: scene }, { action: record }]));
    const voiceStep = parseAction(multi([{ action: scene }, { action: { type: "voice.speak", text: "Hi" } }]));
    expect(isKeyActionAllowedOnBoard("deck", deckSteps)).toBe(true);
    expect(isKeyActionAllowedOnBoard("voice", deckSteps)).toBe(false);
    expect(isKeyActionAllowedOnBoard("deck", voiceStep)).toBe(false);
    expect(() => makeBoard("d", "D", "deck", [createKey({ slot: 1, action: voiceStep })])).toThrow(InvalidBoardError);

    const repository = new InMemoryBoardRepository([makeBoard("d", "D", "deck"), makeBoard("v", "V", "voice")]);
    await expect(setKey(repository, "d", { slot: 1, label: "Intro", action: deckSteps })).resolves.toMatchObject({ action: deckSteps });
    await expect(setKey(repository, "d", { slot: 2, action: voiceStep })).rejects.toThrow(InvalidBoardError);
    await expect(setKey(repository, "v", { slot: 2, action: deckSteps })).rejects.toThrow(InvalidBoardError);
    expect(readStoredBoards(JSON.parse(JSON.stringify(await repository.list())))).toEqual(await repository.list());
  });
});
