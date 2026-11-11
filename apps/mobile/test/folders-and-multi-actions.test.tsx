import { FOLDER_BACK_KEY, makeBoard, makeFolderBoard, type Action, type Board, type Key, type ObsState } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp } from "./app-fakes";
import type { RecordedRequest } from "./desktop-fakes";
import { goTo } from "./i18n-helpers";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const sections = () => screen.getByRole("navigation", { name: "Sections" });
const storedBoards = () => (JSON.parse(localStorage.getItem("speed-deck:boards") ?? "{}") as { boards?: Board[] }).boards ?? [];

/** A Deck board "Stream" with a folder "Scenes" opened from its second page (slot 16 of a 5 × 3 grid). */
function boardsWithFolder(): Board[] {
  const stream = makeBoard("stream", "Stream", "deck", [
    { slot: 0, label: "First", action: { type: "nav.nextPage" } },
    { slot: 16, label: "Scenes", action: { type: "nav.openFolder", folderId: "scenes" } },
  ]);
  const scenes = { ...makeFolderBoard("scenes", "Scenes", stream), keys: [FOLDER_BACK_KEY, { slot: 1, label: "Inside", action: { type: "nav.goToPage", page: 1 } } as Key] };
  return [stream, scenes, boardOf("talk", "Talk")];
}

async function openStream(boards = boardsWithFolder()) {
  const rendered = renderLocalApp({ boards });
  await goTo(rendered.user, "Deck");
  await screen.findByRole("button", { name: "First" });
  return rendered;
}

describe("folders", () => {
  it("opens a folder with its path and Back in the first cell, and Back returns to the same page", async () => {
    const { user } = await openStream();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Scenes" }));

    expect(screen.getByRole("navigation", { name: "Folder path" })).toHaveTextContent("Stream › Scenes");
    const cells = within(grid()).getAllByRole("listitem");
    expect(within(cells[0]!).getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inside" })).toBeInTheDocument();
    // The Back key has no menu: it cannot be edited, moved or deleted.
    expect(screen.queryByRole("button", { name: "Options for key 1" })).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Board: Stream" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Folder path" })).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("never lists folders in the side menu or the board menu, and keeps their board active inside them", async () => {
    const { user } = await openStream();
    expect(within(sections()).getByRole("link", { name: "Stream" })).toBeInTheDocument();
    expect(within(sections()).queryByRole("link", { name: "Scenes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Board: Stream" }));
    const menu = screen.getByRole("menu", { name: "Boards" });
    expect(within(menu).getByRole("menuitemradio", { name: "Stream" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitemradio", { name: "Scenes" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Scenes" }));
    expect(within(sections()).getByRole("link", { name: "Stream" })).toHaveAttribute("aria-current", "page");
  });

  it("creates a folder board when a Folder key is added, and opens it", async () => {
    const { user } = await openStream([makeBoard("stream", "Stream", "deck", [{ slot: 0, label: "First", action: { type: "nav.nextPage" } }])]);
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 2" })).getByRole("button", { name: /^Folder/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Folder" })).toBeInTheDocument());
    const boards = storedBoards();
    const folder = boards.find((board) => board.parentId === "stream");
    expect(folder).toMatchObject({ name: "Folder", kind: "deck", keys: [FOLDER_BACK_KEY] });
    expect(boards[0]!.keys[1]).toMatchObject({ slot: 1, label: "Folder", action: { type: "nav.openFolder", folderId: folder!.id } });

    await user.click(screen.getByRole("button", { name: "Folder" }));
    expect(screen.getByRole("navigation", { name: "Folder path" })).toHaveTextContent("Stream › Folder");
    expect(within(grid()).getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("asks before deleting a folder key and then deletes the folder with it", async () => {
    const { user } = await openStream();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: "Scenes" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText("Delete this folder and all its keys?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Scenes" })).not.toBeInTheDocument());
    expect(storedBoards().map((board) => board.id)).toEqual(["stream", "talk"]);
  });
});

const idle: ObsState = { currentScene: "BRB", mutedInputs: [], streaming: false, recording: false };
const intro: Action = {
  type: "system.multiAction",
  steps: [
    { action: { type: "obs.switchScene", sceneName: "Main" }, delayMs: 0 },
    { action: { type: "obs.toggleMute", inputName: "Mic" }, delayMs: 1000 },
    { action: { type: "obs.toggleRecord" }, delayMs: 0 },
  ],
};
const executions = (requests: readonly RecordedRequest[]) =>
  requests.filter((request) => request.url === "/api/actions/execute").map((request) => request.body as { action: Action; key?: unknown });

async function openRemoteDeck(keys: Key[]) {
  const state = desktopState({ boards: [boardOf("talk", "Talk"), boardOf("stream", "Stream", keys, "deck")] });
  state.obs = { enabled: true, status: "connected", state: idle };
  const remote = renderRemoteApp({ state });
  await goTo(remote.user, "Deck");
  return remote;
}

describe("multi-actions", () => {
  it("asks once before a sequence that starts recording, then runs it on the computer as that key", async () => {
    const { requests, user } = await openRemoteDeck([{ slot: 2, label: "Intro", action: intro }]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Intro" })).not.toHaveAttribute("aria-disabled"));
    await user.click(screen.getByRole("button", { name: "Intro" }));
    const dialog = screen.getByRole("dialog", { name: "Start recording?" });
    expect(executions(requests)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(executions(requests)).toEqual([{ action: intro, key: { boardId: "stream", slot: 2 } }]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the key running while the computer runs it, and says which steps failed", async () => {
    const { emit } = await openRemoteDeck([{ slot: 2, label: "Intro", action: intro }]);
    const key = await screen.findByRole("button", { name: "Intro" });
    act(() => emit({ type: "multi-action", runId: "stream:2", key: { boardId: "stream", slot: 2 }, state: "start" }));
    expect(screen.getByRole("button", { name: "Intro Running" })).toHaveAttribute("data-state", "running");
    act(() =>
      emit({ type: "multi-action", runId: "stream:2", key: { boardId: "stream", slot: 2 }, state: "end", failures: [{ index: 1, type: "obs.toggleMute", message: "No source." }] }),
    );
    expect(key).not.toHaveAttribute("data-state");
    await waitFor(() => expect(screen.getAllByRole("status").some((status) => /Some steps of the multi-action failed: 2\./.test(status.textContent ?? ""))).toBe(true));
  });

  it("edits the steps: add, fill in, wait, reorder and remove", async () => {
    const { requests, state, user } = await openRemoteDeck([]);
    await user.click(await screen.findByRole("button", { name: "Add a key at position 1" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 1" })).getByRole("button", { name: /^Multi-action/ }));
    const steps = screen.getByRole("group", { name: "Steps" });
    expect(within(steps).getAllByRole("group", { name: /^Step \d$/ })).toHaveLength(2);

    const step = (number: number) => within(steps).getByRole("group", { name: `Step ${number}` });
    await user.selectOptions(within(step(1)).getByRole("combobox", { name: "Action" }), "obs.toggleRecord");
    await user.selectOptions(within(step(2)).getByRole("combobox", { name: "Action" }), "obs.switchScene");
    await waitFor(() => expect(within(step(2)).getByRole("option", { name: "BRB" })).toBeInTheDocument());
    await user.selectOptions(within(step(2)).getByRole("combobox", { name: "Scene" }), "BRB");
    await user.type(within(step(2)).getByRole("spinbutton", { name: "Wait before (seconds)" }), "1.5");
    await user.click(within(steps).getByRole("button", { name: "Add step" }));
    await user.selectOptions(within(step(3)).getByRole("combobox", { name: "Action" }), "obs.toggleStream");
    // The scene switch goes first, then the third step is removed again.
    await user.click(within(step(2)).getByRole("button", { name: "Move up" }));
    await user.click(within(step(3)).getByRole("button", { name: "Remove step" }));
    expect(within(steps).getAllByRole("group", { name: /^Step \d$/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((request) => request.method === "PUT" && request.url === "/api/boards/stream/keys/0")).toBe(true));
    expect(state.boards[1]!.keys[0]!.action).toEqual({
      type: "system.multiAction",
      steps: [
        { action: { type: "obs.switchScene", sceneName: "BRB" }, delayMs: 1500 },
        { action: { type: "obs.toggleRecord" }, delayMs: 0 },
      ],
    });
  });

  it("refuses to save fewer than two steps and offers only actions a step can run", async () => {
    const { requests, user } = await openRemoteDeck([]);
    await user.click(await screen.findByRole("button", { name: "Add a key at position 1" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add key 1" })).getByRole("button", { name: /^Multi-action/ }));
    const steps = screen.getByRole("group", { name: "Steps" });
    const actions = within(within(steps).getByRole("group", { name: "Step 1" })).getByRole("combobox", { name: "Action" });
    const offered = within(actions).getAllByRole("option").map((option) => (option as HTMLOptionElement).value);
    expect(offered).toContain("obs.toggleRecord");
    for (const type of ["nav.nextPage", "nav.openFolder", "obs.inputVolume", "system.multiAction"]) expect(offered).not.toContain(type);

    await user.click(within(within(steps).getByRole("group", { name: "Step 2" })).getByRole("button", { name: "Remove step" }));
    await user.selectOptions(actions, "obs.toggleRecord");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A multi-action needs 2 to 10 steps.");
    expect(requests.some((request) => request.method === "PUT")).toBe(false);
  });
});
