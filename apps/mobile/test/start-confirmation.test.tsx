import type { Key, ObsState } from "@speed-deck/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RecordedRequest } from "./desktop-fakes";
import { boardOf, desktopState, renderRemoteApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const idle: ObsState = { currentScene: "BRB", mutedInputs: [], streaming: false, recording: false };
const keys: Key[] = [
  { slot: 0, action: { type: "obs.toggleStream" } },
  { slot: 1, action: { type: "obs.toggleRecord" } },
];

async function openDeck(obsState = idle) {
  const state = desktopState({ boards: [boardOf("stream", "Stream", keys, "deck")] });
  state.obs = { enabled: true, status: "connected", state: obsState };
  const remote = renderRemoteApp({ state });
  await goTo(remote.user, "Deck");
  await waitFor(() => expect(screen.getByRole("button", { name: /^Record/ })).not.toHaveAttribute("aria-disabled"));
  return remote;
}

const executed = (requests: readonly RecordedRequest[], type: string) =>
  requests.filter((request) => request.url === "/api/actions/execute" && (request.body as { action: { type: string } }).action.type === type).length;

describe.each([
  { type: "obs.toggleRecord", key: "Record", onKey: "Record REC", title: "Start recording?", confirm: "Start recording", on: { recording: true } },
  { type: "obs.toggleStream", key: "Stream", onKey: "Stream LIVE", title: "Start streaming?", confirm: "Start streaming", on: { streaming: true } },
])("confirming before $confirm", ({ type, key, onKey, title, confirm, on }) => {
  it("asks first while it is off, and runs only once confirmed", async () => {
    const { requests, user } = await openDeck();
    await user.click(screen.getByRole("button", { name: key }));
    const dialog = screen.getByRole("dialog", { name: title });
    expect(executed(requests, type)).toBe(0);
    await user.click(within(dialog).getByRole("button", { name: confirm }));
    await waitFor(() => expect(executed(requests, type)).toBe(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("runs nothing when cancelled", async () => {
    const { requests, user } = await openDeck();
    await user.click(screen.getByRole("button", { name: key }));
    await user.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(executed(requests, type)).toBe(0);
  });

  it("stops at once while it is on", async () => {
    const { requests, user } = await openDeck({ ...idle, ...on });
    await user.click(await screen.findByRole("button", { name: onKey }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(executed(requests, type)).toBe(1));
  });
});

it("asks before the key editor's Test starts a recording", async () => {
  const { requests, user } = await openDeck();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Record" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  await user.click(within(screen.getByRole("dialog", { name: "Edit key 2" })).getByRole("button", { name: "Test" }));
  const confirmation = screen.getByRole("dialog", { name: "Start recording?" });
  expect(executed(requests, "obs.toggleRecord")).toBe(0);
  await user.click(within(confirmation).getByRole("button", { name: "Start recording" }));
  await waitFor(() => expect(executed(requests, "obs.toggleRecord")).toBe(1));
});
