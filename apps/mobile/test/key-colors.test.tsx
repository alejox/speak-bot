import type { Key, ObsState } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const idle: ObsState = { currentScene: "BRB", mutedInputs: [], streaming: false, recording: false };
const recordKey: Key = { slot: 0, color: "#112233", activeColor: "#ff0000", action: { type: "obs.toggleRecord" } };

async function openDeck(keys: Key[]) {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi", { activeColor: "#00ff00" })]), boardOf("stream", "Stream", keys, "deck")] });
  state.obs = { enabled: true, status: "connected", state: idle };
  const remote = renderRemoteApp({ state });
  await screen.findByRole("button", { name: "Hi" });
  await goTo(remote.user, "Deck");
  await screen.findByRole("button", { name: /^Record/ });
  return { ...remote, state };
}

async function editKey(user: { click: (element: Element) => Promise<void> }, name: RegExp | string, number: number) {
  fireEvent.contextMenu(screen.getByRole("button", { name }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  return screen.getByRole("dialog", { name: `Edit key ${number}` });
}

describe("a key's colour when on", () => {
  it("fills the key with its on colour while the toggle is on, and its own colour while off", async () => {
    const { emit } = await openDeck([recordKey]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Record" })).toHaveStyle({ backgroundColor: "#112233" }));
    act(() => emit({ type: "obs-state", state: { ...idle, recording: true } }));
    expect(screen.getByRole("button", { name: "Record REC" })).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("offers a colour when off and one when on for keys with an on state, and saves both", async () => {
    const { user, requests } = await openDeck([recordKey]);
    const dialog = await editKey(user, /^Record/, 1);
    expect(within(dialog).queryByRole("group", { name: "Color" })).not.toBeInTheDocument();
    const off = within(dialog).getByRole("group", { name: "Color when off" });
    const on = within(dialog).getByRole("group", { name: "Color when on" });
    expect(within(off).getByRole("textbox", { name: "Hex color" })).toHaveValue("#112233");
    await user.click(within(on).getByRole("radio", { name: "Green" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(requests).toContainEqual(
        expect.objectContaining({ method: "PUT", url: "/api/boards/stream/keys/0", body: expect.objectContaining({ color: "#112233", activeColor: "#16a34a" }) }),
      ),
    );
  });

  it("keeps a single colour for keys without an on state and drops a stored on colour when saved", async () => {
    const { user, requests } = await openDeck([recordKey]);
    await goTo(user, "Voice");
    const dialog = await editKey(user, "Hi", 1);
    expect(within(dialog).getByRole("group", { name: "Color" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("group", { name: "Color when on" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((request) => request.method === "PUT" && request.url === "/api/boards/talk/keys/0")).toBe(true));
    const saved = requests.find((request) => request.method === "PUT" && request.url === "/api/boards/talk/keys/0")!.body as { activeColor?: string };
    expect(saved.activeColor ?? "").toBe("");
  });
});
