import type { Action, Board, Key, ObsSourceTransform } from "@speed-deck/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { draftOf, draftToKey } from "../src/app/key-draft";
import { hasOnState, keyLabel, presentKey, type KeyContext } from "../src/app/key-presentation";
import { translate } from "../src/i18n/messages";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const corner: ObsSourceTransform = { positionX: 1440, positionY: 810, scaleX: 0.25, scaleY: 0.25, rotation: 0, crop: { left: 0, top: 0, right: 0, bottom: 0 } };
const cropped: ObsSourceTransform = { ...corner, crop: { left: 10, top: 0, right: 20, bottom: 0 }, bounds: { type: "OBS_BOUNDS_SCALE_INNER", width: 480, height: 270 } };
const moveAction: Action = { type: "obs.moveSource", sceneName: "Main", sourceName: "Cam", transform: cropped, durationMs: 300 };
const moveKey: Key = { slot: 0, action: moveAction };
const t = (key: Parameters<typeof translate>[1]) => translate("en", key);
const boards = (deckKeys: Key[] = []): Board[] => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", deckKeys, "deck")];
const grid = () => screen.getByRole("list", { name: /^Keys of/ });

async function openDeck(options: { deckKeys?: Key[]; transforms?: Record<string, object> | null } = {}) {
  const state = desktopState({ boards: boards(options.deckKeys) });
  state.sceneItems = { Main: ["Cam", "Overlay"], BRB: ["Logo"] };
  state.transforms = options.transforms === undefined ? { "Main/Cam": corner } : options.transforms;
  const rendered = renderRemoteApp({ state });
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  await goTo(rendered.user, "Deck");
  await screen.findByRole("button", { name: "Board: Stream" });
  return { ...rendered, state };
}

type User = Awaited<ReturnType<typeof openDeck>>["user"];

/** Opens the editor of a new "Move and resize source" key and picks the scene and the source. */
async function addMoveKey(user: User, sourceName = "Cam") {
  await user.click(screen.getByRole("button", { name: "Add a key at position 1" }));
  await user.click(within(screen.getByRole("dialog", { name: "Add key 1" })).getByRole("button", { name: "Move and resize source" }));
  const dialog = screen.getByRole("dialog", { name: "Add key 1" });
  await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Scene" }), await within(dialog).findByRole("option", { name: "Main" }));
  await user.selectOptions(within(dialog).getByRole("combobox", { name: "Source" }), await within(dialog).findByRole("option", { name: sourceName }));
  return dialog;
}

const capture = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Use the source's current position" });
const savedKey = (requests: Array<{ method: string; url: string; body?: unknown }>) => requests.find((request) => request.method === "PUT" && request.url === "/api/boards/stream/keys/0");

describe("the move source key draft", () => {
  it("round-trips a key, keeping the crop and bounding box it cannot show", () => {
    const draft = draftOf(moveKey);
    expect(draft.params).toMatchObject({ sceneName: "Main", sourceName: "Cam", positionX: "1440", positionY: "810", scaleX: "25", scaleY: "25", rotation: "0", durationMs: "300" });
    expect(draftToKey(0, draft, t)).toMatchObject({ ok: true, key: { action: moveAction } });
  });

  it("reads edited numbers, with a comma or a point, and an empty time as instant", () => {
    const draft = draftOf(moveKey);
    const edited = { ...draft, params: { ...draft.params, positionX: "100,5", scaleX: "50", scaleY: "-100", rotation: "-90", durationMs: "" } };
    expect(draftToKey(0, edited, t)).toMatchObject({
      ok: true,
      key: { action: { ...moveAction, durationMs: 0, transform: { ...cropped, positionX: 100.5, scaleX: 0.5, scaleY: -1, rotation: -90 } } },
    });
  });

  it("explains a missing target and numbers out of range, naming the field", () => {
    const draft = draftOf(undefined, "obs.moveSource");
    const chosen = { ...draft, params: { sceneName: "Main", sourceName: "Cam" } };
    expect(draftToKey(0, chosen, t)).toMatchObject({ ok: false, error: { key: "editor.moveTargetRequired" }, field: "capture" });

    const full = draftOf(moveKey);
    const withParams = (params: Record<string, string>) => draftToKey(0, { ...full, params: { ...full.params, ...params } }, t);
    expect(withParams({ positionX: "far" })).toMatchObject({ ok: false, error: { key: "editor.numberBetween", params: { field: "X position (px)", min: -90000, max: 90000 } }, field: "positionX" });
    expect(withParams({ positionY: "" })).toMatchObject({ ok: false, error: { key: "editor.paramRequired", params: { field: "Y position (px)" } }, field: "positionY" });
    expect(withParams({ scaleX: "10001" })).toMatchObject({ ok: false, error: { key: "editor.numberBetween", params: { field: "Horizontal scale (%)", min: -10000, max: 10000 } }, field: "scaleX" });
    expect(withParams({ rotation: "400" })).toMatchObject({ ok: false, error: { key: "editor.numberBetween", params: { min: -360, max: 360 } }, field: "rotation" });
    expect(withParams({ durationMs: "2500" })).toMatchObject({ ok: false, error: { key: "editor.numberRange", params: { field: "Animation time (ms)", min: 0, max: 2000 } }, field: "durationMs" });
    expect(withParams({ durationMs: "10.5" })).toMatchObject({ ok: false, field: "durationMs" });
  });
});

describe("the move source key on a board", () => {
  const context: KeyContext = {
    isConnected: true,
    obs: { enabled: true, status: "connected", state: { currentScene: "Main", mutedInputs: [], streaming: false, recording: false, hiddenSources: [] } },
    captionsVisible: true,
    voiceLanguage: "en",
    boards: [],
  };

  it("is named after its source and has no on or off state", () => {
    expect(keyLabel(moveKey, [], t)).toBe("Cam");
    expect(presentKey(moveAction, context)).toEqual({});
    expect(hasOnState("obs.moveSource")).toBe(false);
  });

  it("needs the computer and a connected OBS", () => {
    expect(presentKey(moveAction, { ...context, isConnected: false })).toEqual({ disabledReason: "key.needsComputer" });
    expect(presentKey(moveAction, { ...context, obs: { ...context.obs!, status: "disconnected" } })).toEqual({ disabledReason: "key.obsDisconnected" });
  });
});

describe("the move source action in the key editor", () => {
  it("is offered on Deck boards in the OBS group, right after showing or hiding a source", async () => {
    const { user } = await openDeck();
    await user.click(screen.getByRole("button", { name: "Add a key at position 1" }));
    const names = within(within(screen.getByRole("dialog")).getByRole("region", { name: "OBS" })).getAllByRole("button").map((button) => button.textContent);
    expect(names[names.indexOf("Show or hide source") + 1]).toBe("Move and resize source");
  });

  it("is not offered on Voice boards", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: boards() }) });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Move and resize source" })).not.toBeInTheDocument();
  });

  it("cannot be saved before a position is captured", async () => {
    const { user, requests } = await openDeck();
    const dialog = await addMoveKey(user);
    expect(within(dialog).getByText("No position yet. Place the source in OBS, then use its current position.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("spinbutton", { name: "X position (px)" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Use the source's current position before saving.");
    expect(savedKey(requests)).toBeUndefined();
  });

  it("fills the fields from where the source is in OBS and saves the numbers as edited", async () => {
    const { user, requests } = await openDeck({ transforms: { "Main/Cam": cropped } });
    const dialog = await addMoveKey(user);
    expect(capture(dialog)).toBeEnabled();
    await user.click(capture(dialog));

    const x = await within(dialog).findByRole("spinbutton", { name: "X position (px)" });
    expect(x).toHaveValue(1440);
    expect(within(dialog).getByRole("spinbutton", { name: "Y position (px)" })).toHaveValue(810);
    expect(within(dialog).getByRole("spinbutton", { name: "Horizontal scale (%)" })).toHaveValue(25);
    expect(within(dialog).getByRole("spinbutton", { name: "Vertical scale (%)" })).toHaveValue(25);
    expect(within(dialog).getByRole("spinbutton", { name: "Rotation (degrees)" })).toHaveValue(0);
    expect(within(dialog).getByText("The crop and bounding box captured with it are restored too.")).toBeInTheDocument();
    expect(requests).toContainEqual({ method: "GET", url: "/api/obs/scenes/Main/items/Cam/transform", body: undefined });

    await user.clear(x);
    await user.type(x, "1200");
    await user.type(within(dialog).getByRole("spinbutton", { name: "Animation time (ms)" }), "400");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(savedKey(requests)).toBeDefined());
    expect(savedKey(requests)!.body).toMatchObject({
      action: { type: "obs.moveSource", sceneName: "Main", sourceName: "Cam", transform: { ...cropped, positionX: 1200 }, durationMs: 400 },
    });
    const key = await within(grid()).findByRole("button", { name: "Cam" });
    await user.click(key);
    await waitFor(() => expect(requests.some((request) => request.method === "POST" && request.url === "/api/actions/execute" && (request.body as { action: Action }).action.type === "obs.moveSource")).toBe(true));
  });

  it("moves at once when no animation time is typed", async () => {
    const { user, requests } = await openDeck();
    const dialog = await addMoveKey(user);
    await user.click(capture(dialog));
    await within(dialog).findByRole("spinbutton", { name: "X position (px)" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(savedKey(requests)).toBeDefined());
    expect(savedKey(requests)!.body).toMatchObject({ action: { type: "obs.moveSource", transform: corner, durationMs: 0 } });
  });

  it("asks for the scene and the source before it can capture", async () => {
    const { user } = await openDeck();
    await user.click(screen.getByRole("button", { name: "Add a key at position 1" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 1" })).getByRole("button", { name: "Move and resize source" }));
    const dialog = screen.getByRole("dialog", { name: "Add key 1" });
    expect(capture(dialog)).toBeDisabled();
    expect(within(dialog).getByText("Choose the scene and the source first.")).toBeInTheDocument();
  });

  it("says so when OBS is not connected", async () => {
    const { user } = await openDeck({ transforms: null });
    const dialog = await addMoveKey(user);
    await user.click(capture(dialog));
    expect(await within(dialog).findByText("OBS is not connected, so the position cannot be read.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("spinbutton", { name: "X position (px)" })).not.toBeInTheDocument();
  });

  it("says so when the scene or the source is no longer in OBS, and keeps the numbers it had", async () => {
    const { user } = await openDeck({ deckKeys: [moveKey], transforms: {} });
    fireEvent.contextMenu(await within(grid()).findByRole("button", { name: "Cam" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("spinbutton", { name: "X position (px)" })).toHaveValue(1440);
    expect(within(dialog).getByRole("spinbutton", { name: "Animation time (ms)" })).toHaveValue(300);
    await user.click(capture(dialog));
    expect(await within(dialog).findByText("OBS no longer has that scene or that source in it.")).toBeInTheDocument();
    expect(within(dialog).getByRole("spinbutton", { name: "X position (px)" })).toHaveValue(1440);
  });

  it("works as a step of a multi-action", async () => {
    const { user, state, requests } = await openDeck();
    await user.click(screen.getByRole("button", { name: "Add a key at position 1" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 1" })).getByRole("button", { name: /^Multi-action/ }));
    const steps = screen.getByRole("group", { name: "Steps" });
    const step = (number: number) => within(steps).getByRole("group", { name: `Step ${number}` });
    await user.selectOptions(within(step(1)).getByRole("combobox", { name: "Action" }), "obs.toggleRecord");
    await user.selectOptions(within(step(2)).getByRole("combobox", { name: "Action" }), "obs.moveSource");
    await user.selectOptions(await within(step(2)).findByRole("combobox", { name: "Scene" }), await within(step(2)).findByRole("option", { name: "Main" }));
    await user.selectOptions(within(step(2)).getByRole("combobox", { name: "Source" }), await within(step(2)).findByRole("option", { name: "Cam" }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use the source's current position before saving.");

    await user.click(within(step(2)).getByRole("button", { name: "Use the source's current position" }));
    await within(step(2)).findByRole("spinbutton", { name: "X position (px)" });
    await user.type(within(step(2)).getByRole("spinbutton", { name: "Animation time (ms)" }), "500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(savedKey(requests)).toBeDefined());
    expect(state.boards[1]!.keys[0]!.action).toEqual({
      type: "system.multiAction",
      steps: [
        { action: { type: "obs.toggleRecord" }, delayMs: 0 },
        { action: { type: "obs.moveSource", sceneName: "Main", sourceName: "Cam", transform: corner, durationMs: 500 }, delayMs: 0 },
      ],
    });
  });

  it("needs the computer in phone-only mode", async () => {
    const { user } = renderLocalApp({ boards: boards([moveKey]) });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    const key = await within(grid()).findByRole("button", { name: "Cam" });
    expect(key).toHaveAttribute("aria-disabled", "true");
    expect(key).toHaveAccessibleDescription("Needs the computer app.");
  });
});
