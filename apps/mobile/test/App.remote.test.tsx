import { buildDefaultBoards } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderRemoteApp, speakKey, writes } from "./app-fakes";
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

  it("toggles captions and the voice language on the desktop, showing the new state", async () => {
    const state = desktopState({ boards: buildDefaultBoards("en") });
    state.execute["captions.toggle"] = { body: { ok: true, captionsVisible: false } };
    state.execute["voice.toggleLanguage"] = { body: { ok: true, voiceLanguage: "es" } };
    const { user } = renderRemoteApp({ state });

    // The voice commands are in the Voice space; captions are in the Deck space.
    const language = await screen.findByRole("button", { name: /Switch voice language/ });
    expect(screen.queryByRole("button", { name: "Hide or show captions" })).not.toBeInTheDocument();
    await user.click(language);
    await waitFor(() => expect(language).toHaveTextContent("Voice: Español"));

    await goTo(user, "Deck");
    const captions = await screen.findByRole("button", { name: "Hide or show captions" });
    expect(captions).toHaveAttribute("aria-pressed", "false");
    await user.click(captions);
    await waitFor(() => expect(captions).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("status")).toHaveTextContent("Captions hidden in OBS.");
  });

  it("explains desktop refusals in the interface language", async () => {
    const state = desktopState();
    state.execute["voice.repeat"] = { status: 404, body: { error: "Nothing.", code: "nothing-to-repeat" } };
    const { user } = renderRemoteApp({ state });
    await user.click(await screen.findByRole("button", { name: "Repeat" }));
    expect(await screen.findByText("Nothing has been said yet to repeat.")).toBeInTheDocument();
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

    const mic = await screen.findByRole("button", { name: "Mic" });
    await waitFor(() => expect(mic).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Main" })).toHaveAttribute("aria-pressed", "true");
    const stream = screen.getByRole("button", { name: "Start or stop stream" });
    expect(stream).toHaveAttribute("aria-pressed", "false");

    act(() => emit({ type: "obs-state", state: { currentScene: "BRB", mutedInputs: [], streaming: true, recording: false } }));
    expect(mic).toHaveAttribute("aria-pressed", "false");
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
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Action" }), "Speak text");
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
    expect(await screen.findByRole("option", { name: "Alex (en-US)" })).toBeInTheDocument();
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

  it("switches back to this device, with this device's boards, and persists the choice", async () => {
    const { local, user, getTarget, requests } = renderRemoteApp();
    await screen.findByRole("button", { name: "Hello" });
    await goTo(user, "Settings");
    await user.selectOptions(await screen.findByRole("combobox", { name: "Speak on" }), "device");
    expect(getTarget()).toBe("device");
    expect(screen.queryByRole("combobox", { name: "Output device" })).not.toBeInTheDocument();
    await goTo(user, "Voice");
    await user.click(await screen.findByRole("button", { name: "Local phrase" }));
    expect(local.texts).toEqual(["Local phrase"]);
    expect(executed(requests)).toEqual([]);
  });

  it("stays local and hides the setting when no desktop answers", async () => {
    const { user } = renderRemoteApp({ noDesktop: true });
    expect(await screen.findByRole("button", { name: "Local phrase" })).toBeInTheDocument();
    await goTo(user, "Settings");
    expect(screen.queryByRole("combobox", { name: "Speak on" })).not.toBeInTheDocument();
  });
});
