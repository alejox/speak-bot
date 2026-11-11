import { makeBoard, type Board, type Key } from "@speed-deck/core";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { canEditDeck } from "../src/app/edit-capability";
import { boardOf, desktopState, renderRemoteApp, setScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

/* The Deck (the OBS keys) is created and edited on the computer only; any other page plays it as configured. */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const TABLET = { width: 1024, height: 768 };

const scene = (slot: number, sceneName: string): Key => ({ slot, action: { type: "obs.switchScene", sceneName } });
const deckBoard = (): Board =>
  makeBoard("stream", "Stream", "deck", [scene(0, "Intro"), scene(1, "Talk"), { slot: 2, action: { type: "obs.inputVolume", inputName: "Music" } }], { columns: 4, rows: 3 });

async function open(servedFrom: string) {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), deckBoard()], volumes: { Music: 0.5 } });
  state.obs = { enabled: true, status: "connected", state: { currentScene: "Main", mutedInputs: [], streaming: false, recording: false } };
  const remote = renderRemoteApp({ state, servedFrom });
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  return remote;
}

async function openDeck(servedFrom: string) {
  const remote = await open(servedFrom);
  await goTo(remote.user, "Deck");
  await screen.findByRole("list", { name: "Keys of Stream" });
  return remote;
}

const expectNoDeckEditing = () => {
  expect(screen.queryByRole("button", { name: "Edit keys" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Grid size" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Add a key/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Options for key/ })).not.toBeInTheDocument();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Intro" }));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
};

/** The board menu's items, by name. */
async function boardMenuItems(user: { click: (element: Element) => Promise<void> }, boardName: string) {
  await user.click(screen.getByRole("button", { name: `Board: ${boardName}` }));
  const menu = within(screen.getByRole("menu", { name: "Boards" }));
  return [...menu.queryAllByRole("menuitemradio"), ...menu.queryAllByRole("menuitem")].map((item) => item.textContent ?? "");
}
const MANAGE_ITEMS = [/^New board/, /^Rename/, /^Delete/, /^Restore/];
const hasItem = (items: string[], pattern: RegExp) => items.some((item) => pattern.test(item));

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("who may edit the Deck", () => {
  it("is the computer itself only", () => {
    for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) expect(canEditDeck(hostname)).toBe(true);
    for (const hostname of ["192.168.1.20", "appassets.androidplatform.net", "speed-deck.example.com", ""]) expect(canEditDeck(hostname)).toBe(false);
  });

  it.each([PHONE_SIDEWAYS, TABLET])("a phone plays the Deck as configured at $width x $height: no editing, volume still works", async (size) => {
    setScreen(size);
    const { requests } = await openDeck("192.168.1.20");
    expectNoDeckEditing();
    expect(screen.getByRole("slider", { name: /Music/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intro" }));
    expect(requests.some((request) => request.url.endsWith("/actions/execute"))).toBe(true);
  });

  it("a phone still edits its Voice keys and saves phrases from the sheet", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = await open("192.168.1.20");
    expect(screen.getByRole("button", { name: "Edit keys" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Write" }));
    expect(within(screen.getByRole("dialog", { name: "Write" })).getByRole("button", { name: "Save as key" })).toBeInTheDocument();
  });

  it.each([PHONE_SIDEWAYS, TABLET])("a phone only switches Deck boards from the board menu at $width x $height", async (size) => {
    setScreen(size);
    const { user } = await openDeck("192.168.1.20");
    const items = await boardMenuItems(user, "Stream");
    for (const pattern of MANAGE_ITEMS) expect(hasItem(items, pattern)).toBe(false);
    expect(hasItem(items, /^Stream/)).toBe(true);
  });

  it("a phone shows an empty Deck without offering to create a board", async () => {
    setScreen(TABLET);
    const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    const { user } = renderRemoteApp({ state, servedFrom: "192.168.1.20" });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    expect(await screen.findByText("There are no boards here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New board" })).not.toBeInTheDocument();
  });

  it("a phone still manages its Voice boards", async () => {
    setScreen(TABLET);
    const { user } = await open("192.168.1.20");
    const items = await boardMenuItems(user, "Talk");
    expect(hasItem(items, /^New board/)).toBe(true);
    expect(hasItem(items, /^Rename/)).toBe(true);
  });

  it("the computer keeps every Deck editing tool", async () => {
    setScreen(TABLET);
    await openDeck("localhost");
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add a key/ })).toBeInTheDocument();
  });

  it("the computer keeps managing Deck boards", async () => {
    setScreen(TABLET);
    const { user } = await openDeck("localhost");
    const items = await boardMenuItems(user, "Stream");
    for (const pattern of MANAGE_ITEMS) expect(hasItem(items, pattern)).toBe(true);
  });
});
