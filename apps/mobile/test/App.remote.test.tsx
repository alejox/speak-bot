import { buildDefaultBoards } from "@speed-deck/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App";
import { boardOf, desktopState, remoteServices, renderRemoteApp, speakKey, writes } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const executed = (requests: { url: string; body: unknown }[]) =>
  requests.filter((request) => request.url === "/api/actions/execute").map((request) => (request.body as { action: unknown }).action);

describe("App in Computer mode", () => {
  it("defaults to Computer when served by the desktop and speaks typed text through POST /api/speak", async () => {
    const { requests, local, user } = renderRemoteApp();
    expect(await screen.findByRole("button", { name: "Hello" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Text to speak"), "Hi stream");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/speak", body: expect.objectContaining({ text: "Hi stream" }) }));
    expect(local.spoken).toEqual([]);
    await goTo(user, "Settings");
    expect(screen.getByRole("combobox", { name: "Speak on" })).toHaveValue("computer");
  });

  it("keeps looking for the desktop when its first answer fails, then shows its boards", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])], healthFailures: 2 });
    const { requests } = renderRemoteApp({ state });
    expect(await screen.findByRole("button", { name: "Hello" }, { timeout: 5000 })).toBeInTheDocument();
    expect(requests.filter((request) => request.url === "/api/health")).toHaveLength(3);
  });

  it("shows none of this phone's boards while the desktop has not answered yet", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])], healthFailures: 100 });
    const remote = remoteServices({ state });
    const prepare = vi.spyOn(remote.services.boards, "prepare");
    const list = vi.spyOn(remote.services.boards, "list");
    render(<App services={remote.services} />);
    const healthChecks = () => remote.requests.filter((request) => request.url === "/api/health").length;

    // Past the first failed answer and into the retries, the phone's own decks never show nor get created.
    await waitFor(() => expect(healthChecks()).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    expect(screen.queryByRole("button", { name: "Local phrase" })).not.toBeInTheDocument();
    expect(prepare).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("goes straight to this phone's boards when a server that is not the desktop answers", async () => {
    const state = desktopState({ healthStatus: 404 });
    const { requests } = renderRemoteApp({ state });
    expect(await screen.findByRole("button", { name: "Local phrase" })).toBeInTheDocument();
    // Longer than the first retry pause: a definitive answer is not asked again.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(requests.filter((request) => request.url === "/api/health")).toHaveLength(1);
  });

  it("runs keys on the desktop, and navigation keys in this client", async () => {
    const state = desktopState({
      boards: [boardOf("main", "Main", [speakKey(0, "Hello"), { slot: 1, action: { type: "nav.nextPage" } }, speakKey(15, "Later")])],
    });
    const { requests, local, user } = renderRemoteApp({ state });
    await user.click(await screen.findByRole("button", { name: "Hello" }));
    expect(executed(requests)).toEqual([{ type: "voice.speak", text: "Hello" }]);
    expect(local.spoken).toEqual([]);

    await user.click(within(screen.getByRole("list", { name: "Keys of Main" })).getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
    expect(executed(requests)).toHaveLength(1);
  });

  it("explains desktop refusals in the interface language", async () => {
    const state = desktopState();
    state.boards = [boardOf("main", "Main", [speakKey(0, "Hello")]), boardOf("show", "Show", [{ slot: 0, action: { type: "obs.switchScene", sceneName: "Gone" } }], "deck")];
    state.execute["obs.switchScene"] = { status: 502, body: { error: "No such scene.", code: "obs-request-failed" } };
    const { user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hello" });
    await goTo(user, "Deck");
    await user.click(await screen.findByRole("button", { name: /^Gone/ }));
    expect(await screen.findByText("OBS could not do that. Check that the name exists.")).toBeInTheDocument();
  });

  it("keeps Stop enabled while the desktop speaks, whoever started it", async () => {
    const { emit, user } = renderRemoteApp();
    await screen.findByRole("button", { name: "Hello" });
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(stop).toBeDisabled();
    act(() => emit({ type: "speaking", state: "start" }));
    expect(stop).toBeEnabled();
    act(() => emit({ type: "speaking", state: "end" }));
    expect(stop).toBeDisabled();
  });

  it("shows OBS state on keys and follows live changes", async () => {
    const state = desktopState({
      boards: [
        boardOf("main", "Main", [
          { slot: 0, action: { type: "obs.toggleMute", inputName: "Mic" } },
          { slot: 1, action: { type: "obs.switchScene", sceneName: "Main" } },
          { slot: 2, action: { type: "obs.toggleStream" } },
        ], "deck"),
      ],
    });
    state.obs.state = { currentScene: "Main", mutedInputs: ["Mic"], streaming: false, recording: false };
    const { emit, requests, user } = renderRemoteApp({ state });
    await goTo(user, "Deck");

    const mic = await screen.findByRole("button", { name: /^Mic/ });
    // Muted: the mute key is off.
    await waitFor(() => expect(mic).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("button", { name: "Main" })).toHaveAttribute("aria-pressed", "true");
    const stream = screen.getByRole("button", { name: "Stream" });
    expect(stream).toHaveAttribute("aria-pressed", "false");

    act(() => emit({ type: "obs-state", state: { currentScene: "BRB", mutedInputs: [], streaming: true, recording: false } }));
    expect(mic).toHaveAttribute("aria-pressed", "true");
    expect(stream).toHaveAttribute("aria-pressed", "true");

    act(() => emit({ type: "obs-status", status: "error", code: "connection-lost" }));
    expect(stream).toHaveAttribute("aria-disabled", "true");
    expect(stream).toHaveAccessibleDescription("OBS is not connected.");
    fireEvent.click(stream);
    expect(executed(requests)).toEqual([]);

    act(() => emit({ type: "obs-status", status: "connected" }));
    await user.click(stream);
    expect(executed(requests)).toEqual([{ type: "obs.toggleStream" }]);
  });

  it("reloads the board when another device changes it", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Old")])] });
    const { emit } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Old" });
    state.boards = [boardOf("main", "Main", [speakKey(0, "New")])];
    act(() => emit({ type: "boards-changed" }));
    expect(await screen.findByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("edits desktop keys and explains a key taken by another device", async () => {
    const state = desktopState({ boards: [boardOf("main", "Main", [speakKey(0, "Hello")])] });
    const { requests, user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Speak text" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Text to say" }), "Thanks");
    // Another device fills the key meanwhile.
    state.boards = [boardOf("main", "Main", [speakKey(0, "Hello"), speakKey(1, "Theirs")])];
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("That key is already taken.")).toBeInTheDocument();
    expect(writes(requests)).toEqual(["PUT /api/boards/main/keys/1"]);
  });

  it("shows desktop voices and saves the output device on the desktop", async () => {
    const { requests, user } = renderRemoteApp();
    await goTo(user, "Settings");
    expect(await screen.findByRole("option", { name: "Alex · English (United States)" })).toBeInTheDocument();
    const device = await screen.findByRole("combobox", { name: "Output device" });
    await screen.findByRole("option", { name: "BlackHole 2ch" });
    await user.selectOptions(device, "BlackHole 2ch");
    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { deviceId: "BlackHole 2ch" } });
  });

  it("hides the output device selector when the desktop cannot select devices", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ supportsDeviceSelection: false }) });
    await screen.findByRole("button", { name: "Hello" });
    await goTo(user, "Settings");
    await screen.findByRole("combobox", { name: "Speak on" });
    expect(screen.queryByRole("combobox", { name: "Output device" })).not.toBeInTheDocument();
  });

  it("speaks on this device when chosen, keeping the computer's boards and deck, and persists the choice", async () => {
    const state = desktopState({
      boards: [
        boardOf("main", "Main", [speakKey(0, "Hello")]),
        boardOf("show", "Show", [{ slot: 0, action: { type: "obs.switchScene", sceneName: "BRB" } }], "deck"),
      ],
    });
    const { local, user, getTarget, requests } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hello" });
    await goTo(user, "Settings");
    await user.selectOptions(await screen.findByRole("combobox", { name: "Speak on" }), "device");
    expect(getTarget()).toBe("device");
    expect(screen.queryByRole("combobox", { name: "Output device" })).not.toBeInTheDocument();

    // The computer's boards stay; speech moves to this device.
    await goTo(user, "Voice");
    await user.click(await screen.findByRole("button", { name: "Hello" }));
    expect(screen.queryByRole("button", { name: "Local phrase" })).not.toBeInTheDocument();
    expect(local.texts).toEqual(["Hello"]);
    await user.type(screen.getByLabelText("Text to speak"), "Typed here");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(local.texts).toEqual(["Hello", "Typed here"]);
    expect(executed(requests)).toEqual([]);
    expect(requests.filter((request) => request.url === "/api/speak")).toEqual([]);

    // Deck keys still run on the computer, which stays connected.
    await goTo(user, "Deck");
    expect(await screen.findByRole("img", { name: "OBS connected" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Computer not connected/ })).not.toBeInTheDocument();
    const scene = await screen.findByRole("button", { name: "BRB" });
    await waitFor(() => expect(scene).not.toHaveAttribute("aria-disabled", "true"));
    await user.click(scene);
    await waitFor(() => expect(executed(requests)).toEqual([{ type: "obs.switchScene", sceneName: "BRB" }]));
  });

  it("stays local and hides the setting when no desktop answers", async () => {
    const { user } = renderRemoteApp({ noDesktop: true });
    expect(await screen.findByRole("button", { name: "Local phrase" })).toBeInTheDocument();
    await goTo(user, "Settings");
    expect(screen.queryByRole("combobox", { name: "Speak on" })).not.toBeInTheDocument();
  });
});
