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

  it("the computer keeps every Deck editing tool", async () => {
    setScreen(TABLET);
    await openDeck("localhost");
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add a key/ })).toBeInTheDocument();
  });
});
