import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { chooseBoard, findBoardPill } from "./board-picker";
import { describe, expect, it } from "vitest";
import { isDockPath } from "../src/app/route";
import { boardOf, desktopState, renderDock, speakKey } from "./app-fakes";

describe("isDockPath", () => {
  it("matches the dock route under the app base", () => {
    expect(isDockPath("/dock", "/")).toBe(true);
    expect(isDockPath("/dock/", "/")).toBe(true);
    expect(isDockPath("/speak-bot/dock", "/speak-bot/")).toBe(true);
    expect(isDockPath("/", "/")).toBe(false);
    expect(isDockPath("/docks", "/")).toBe(false);
    expect(isDockPath("/dock/extra", "/")).toBe(false);
    expect(isDockPath("/dock", "/speak-bot/")).toBe(false);
  });
});

const executed = (requests: { url: string; body: unknown }[]) =>
  requests.filter((request) => request.url === "/api/actions/execute").map((request) => (request.body as { action: unknown }).action);

describe("DockApp", () => {
  it("is a compact board player that always runs keys on the computer, with no side menu", async () => {
    const state = desktopState({
      boards: [boardOf("main", "Principal", [speakKey(0, "Hola desde la computadora")]), boardOf("games", "Juegos", [speakKey(0, "GG")])],
    });
    state.settings = { ...state.settings, language: "es" };
    // The phone view chose "This device"; the dock must still run keys on the computer.
    const { requests, local, user } = renderDock({ state, storedTarget: "device", language: null, hostname: "127.0.0.1" });

    fireEvent.click(await screen.findByRole("button", { name: "Hola desde la computadora" }));
    await user.type(screen.getByRole("textbox", { name: "Texto para decir" }), "Gracias por el follow{Enter}");
    expect(executed(requests)).toEqual([{ type: "voice.speak", text: "Hola desde la computadora" }]);
    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/speak", body: expect.objectContaining({ text: "Gracias por el follow" }) }));
    expect(local.spoken).toEqual([]);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    await chooseBoard(user, "Juegos", "Tablero");
    expect(screen.getByRole("button", { name: "GG" })).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("speed-deck:dock-board-position") ?? "null")).toEqual({ boardId: "games", page: 0 });
    expect(localStorage.getItem("speed-deck:board-position")).toBeNull();
  });

  it("offers every board in one selector, grouped by kind", async () => {
    const state = desktopState({
      boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [{ slot: 0, action: { type: "obs.toggleStream" } }], "deck"), boardOf("more", "More")],
    });
    const { user } = renderDock({ state });
    await user.click(await findBoardPill());
    const groups = within(screen.getByRole("menu")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Voice", "Deck", "Manage boards"]);
    expect(within(groups[0]!).getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual(["Talk", "More"]);
    expect(within(groups[1]!).getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual(["Stream"]);
    await user.click(within(groups[1]!).getByRole("menuitemradio", { name: "Stream" }));
    expect(screen.getByRole("button", { name: "Start or stop stream" })).toBeInTheDocument();
  });

  it("follows a language chosen on the desktop while it is open", async () => {
    const { emit } = renderDock({ language: null });
    expect(await screen.findByRole("textbox", { name: "Text to speak" })).toBeInTheDocument();
    act(() => emit({ type: "settings-changed", settings: { ...desktopState().settings, language: "es" } }));
    expect(screen.getByRole("textbox", { name: "Texto para decir" })).toBeInTheDocument();
  });

  it("edits a key from the dock through its menu", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hi")])] });
    const { requests, user } = renderDock({ state });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Hi" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit key 1" });
    await user.type(within(dialog).getByRole("textbox", { name: "Label (optional)" }), "Hey");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Hey" })).toBeInTheDocument();
    expect(requests).toContainEqual(expect.objectContaining({ method: "PUT", url: "/api/boards/main/keys/0" }));
  });

  it("stops speech on the computer", async () => {
    const { requests, emit, user } = renderDock();
    await screen.findByRole("button", { name: "Hello" });
    act(() => emit({ type: "speaking", state: "start" }));
    const composer = screen.getByRole("form", { name: "Type to speak" });
    await user.click(within(composer).getByRole("button", { name: "Stop" }));
    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/stop" }));
  });

  it("explains, in the interface language, that the desktop app was not found", async () => {
    const { local } = renderDock({ noDesktop: true, language: null });
    expect(await screen.findByText(/No se encontró la app de Speed Deck en la computadora/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(local.spoken).toEqual([]);
  });
});
