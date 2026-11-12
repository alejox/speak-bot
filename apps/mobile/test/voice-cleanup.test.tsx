import { makeBoard, type Action, type Board, type Key } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { goTo } from "./i18n-helpers";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setScreen, speakKey, writes } from "./app-fakes";

/*
 * Voice on a phone keeps the grid still and holds only phrases: no status line above the keys, the Edit keys
 * toggle among the Voice actions, and no caption, Repeat, Stop or language keys (stored keys stay stored).
 */
const PHONE_SIDEWAYS = { width: 915, height: 412 };
const PHONE_UPRIGHT = { width: 412, height: 915 };
const TABLET = { width: 1024, height: 768 };

const HIDDEN_ACTIONS: Action[] = [
  { type: "captions.clear" },
  { type: "captions.toggle" },
  { type: "voice.repeat" },
  { type: "voice.stop" },
  { type: "voice.toggleLanguage" },
];
const HIDDEN_TYPES = HIDDEN_ACTIONS.map((action) => action.type);

const withCommands = (): Board =>
  makeBoard(
    "talk",
    "Talk",
    "voice",
    [speakKey(0, "Hello"), speakKey(1, "Thanks"), ...HIDDEN_ACTIONS.map((action, index): Key => ({ slot: 2 + index, action })), speakKey(8, "Water")],
    { columns: 4, rows: 3 },
  );
const grid = () => screen.getByRole("list", { name: "Keys of Talk" });

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("the Voice status line on a phone", () => {
  it.each([PHONE_SIDEWAYS, PHONE_UPRIGHT])("is kept for screen readers only at $width x $height, so the keys never move", async (size) => {
    setScreen(size);
    renderLocalApp({ boards: [withCommands()] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    const status = document.querySelector("p.status");
    expect(status).toHaveClass("visually-hidden");
  });

  it("never saves the board while playing a fitted page", async () => {
    setScreen(PHONE_SIDEWAYS);
    const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hello"), speakKey(1, "Thanks")])] });
    const { requests } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes(requests).filter((write) => write.includes("/api/boards"))).toEqual([]);
  });
});

describe("the Edit keys toggle on a phone's Voice space", () => {
  it.each([PHONE_SIDEWAYS, PHONE_UPRIGHT])("sits among the Voice actions with an edit (square-pen) icon, not a gear, at $width x $height", async (size) => {
    setScreen(size);
    const { user } = renderLocalApp({ boards: [withCommands()] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    const actions = screen.getByRole("group", { name: "Voice actions" });
    const toggle = within(actions).getByRole("button", { name: "Edit keys" });
    expect(screen.getAllByRole("button", { name: "Edit keys" })).toHaveLength(1);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    // W7: the gear belongs to Settings in the rail; Edit keys reads as editing the layout.
    expect(toggle.querySelector("svg.lucide-settings")).toBeNull();
    expect(toggle.querySelector("svg.lucide-square-pen")).not.toBeNull();
    await user.click(toggle);
    const pressed = within(screen.getByRole("group", { name: "Voice actions" })).getByRole("button", { name: "Edit keys" });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    expect(pressed.querySelector("svg.lucide-square-pen")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Grid size" })).toBeInTheDocument();
  });

  it("uses the same edit icon in the Deck's top bar", async () => {
    setScreen(PHONE_SIDEWAYS);
    const { user } = renderLocalApp({ boards: [withCommands(), boardOf("stream", "Stream", [], "deck")] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Board: Stream" });
    const toggle = screen.getByRole("button", { name: "Edit keys" });
    expect(toggle.querySelector("svg.lucide-settings")).toBeNull();
    expect(toggle.querySelector("svg.lucide-square-pen")).not.toBeNull();
  });

  it("is named Editar teclas in Spanish", async () => {
    setScreen(PHONE_SIDEWAYS);
    renderLocalApp({ boards: [withCommands()], language: "es" });
    const actions = await screen.findByRole("group", { name: "Acciones de voz" }, { timeout: 5000 });
    expect(within(actions).getByRole("button", { name: "Editar teclas" })).toBeInTheDocument();
  });
});

describe("caption, Repeat, Stop and language keys in the Voice space", () => {
  it.each([PHONE_SIDEWAYS, TABLET])("are not drawn at $width x $height, their cells left as blank places", async (size) => {
    setScreen(size);
    renderLocalApp({ boards: [withCommands()] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    for (const name of ["Clear caption", "Captions", "Repeat", "Stop voice", "Voice language"]) {
      expect(within(grid()).queryByRole("button", { name: new RegExp(`^${name}`) })).not.toBeInTheDocument();
    }
    expect(within(grid()).getByRole("button", { name: "Water" })).toBeInTheDocument();
    // W8: the phone keeps the whole grid too, so Water stays on its own cell after the blank places.
    if (size === PHONE_SIDEWAYS) {
      expect(within(grid()).getAllByRole("button")).toHaveLength(3);
      expect(grid().querySelector('[data-slot="8"]')).toContainElement(within(grid()).getByRole("button", { name: "Water" }));
    }
  });

  it("stay stored, and are never offered for a new Voice key", async () => {
    setScreen(TABLET);
    const { user } = renderLocalApp({ boards: [withCommands()] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    // Their slots are not offered for a new key either, so adding never overwrites one.
    const add = within(grid()).getByRole("button", { name: /^Add a key at position/ });
    expect(["3", "4", "5", "6", "7"].map((number) => `Add a key at position ${number}`)).not.toContain(add.getAttribute("aria-label"));
    await user.click(add);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Speak text/ })).toBeInTheDocument();
    for (const name of ["Clear caption", "Hide or show captions", "Repeat", "Stop voice", "Switch voice language"]) {
      expect(within(dialog).queryByRole("button", { name: new RegExp(`^${name}`) })).not.toBeInTheDocument();
    }
    const stored = (JSON.parse(localStorage.getItem("speed-deck:boards")!) as { boards: Board[] }).boards.find((board) => board.id === "talk")!;
    expect(stored.keys.map((key) => key.action.type)).toEqual(expect.arrayContaining(HIDDEN_TYPES));
  });
});

describe("the Voice key editor", () => {
  it("does not list caption, Repeat, Stop or language actions", async () => {
    setScreen(TABLET);
    const { user } = renderLocalApp({ boards: [withCommands()] });
    await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 });
    await user.click(screen.getByRole("button", { name: /^Options for key 1/ }));
    await user.click(screen.getByRole("menuitem", { name: /Edit/ }));
    const select = await screen.findByRole("combobox", { name: "Action" });
    const values = [...select.querySelectorAll("option")].map((option) => option.getAttribute("value"));
    expect(values).toContain("voice.speak");
    for (const type of HIDDEN_TYPES) expect(values).not.toContain(type);
    await waitFor(() => expect(select).toHaveValue("voice.speak"));
  });
});
