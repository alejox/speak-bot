import { faderPositionToMultiplier, makeBoard, multiplierToFaderPosition, type Board, type Key } from "@speed-deck/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyInput } from "../src/adapters/board-stores";
import { KeyEditorForm } from "../src/components/KeyEditorForm";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setScreen, speakKey, type DesktopState } from "./app-fakes";
import { goTo, renderWithLanguage } from "./i18n-helpers";

/*
 * Volume slider keys. jsdom has no layout, so these tests check the grid placement the styles read (custom
 * properties), not where the key lands on screen. Still manual: the slider lines up with the cells and gaps on
 * a 5 × 3 board, upright and on its side; dragging it on a phone neither scrolls the page nor moves the key.
 */
const volume = (slot: number, rows = 1, columns = 1, inputName = "Music"): Key =>
  rows === 1 && columns === 1
    ? { slot, action: { type: "obs.inputVolume", inputName } }
    : { slot, span: { rows, columns }, action: { type: "obs.inputVolume", inputName } };
const stream = (slot: number): Key => ({ slot, action: { type: "obs.toggleStream" } });
const deckOf = (keys: Key[]): Board => makeBoard("stream", "Stream", "deck", keys);
const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const cellOf = (slot: number) => grid().querySelector<HTMLElement>(`[data-slot="${slot}"]`);
const volumeRequests = (requests: { method: string; url: string; body: unknown }[]) =>
  requests.filter((request) => request.method === "PUT" && request.url === "/api/obs/inputs/Music/volume").map((request) => Math.round(multiplierToFaderPosition((request.body as { volumeMul: number }).volumeMul) * 100));

async function openDeck(keys: Key[], overrides: Partial<DesktopState> = {}) {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), deckOf(keys)], volumes: { Music: faderPositionToMultiplier(0.4) }, ...overrides });
  const remote = renderRemoteApp({ state });
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  await goTo(remote.user, "Deck");
  await screen.findByRole("list", { name: "Keys of Stream" });
  return remote;
}

describe("volume slider keys", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("draws one cell spanning three rows, with no cells under it, and shows the OBS volume", async () => {
    await openDeck([volume(0, 3, 1), stream(1)]);
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    await waitFor(() => expect(slider).toHaveValue("40"));
    expect(slider).toHaveAttribute("aria-valuetext", "40%");
    expect(slider).toBeEnabled();
    expect(cellOf(0)!.style.getPropertyValue("--cell-row")).toBe("1");
    expect(cellOf(0)!.style.getPropertyValue("--cell-column")).toBe("1");
    expect(cellOf(0)!.style.getPropertyValue("--row-span")).toBe("3");
    expect(cellOf(0)!.style.getPropertyValue("--column-span")).toBe("1");
    // Covered cells are not drawn, so they are neither empty places nor a +.
    expect(cellOf(5)).toBeNull();
    expect(cellOf(10)).toBeNull();
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(13);
    // Taller than wide: a vertical slider.
    expect(cellOf(0)!.querySelector(".deck-volume")).toHaveClass("deck-volume-vertical");
  });

  it("looks muted while OBS mutes its input, and the slider still sets the volume", async () => {
    await openDeck([volume(0, 3, 1), stream(1)], {
      obs: { enabled: true, status: "connected", state: { currentScene: "Main", mutedInputs: ["Music"], streaming: false, recording: false } },
    } as Partial<DesktopState>);
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Muted, 40%"));
    // OBS keeps a muted input's volume adjustable, so the slider stays usable; it only looks muted.
    expect(slider).toBeEnabled();
    const key = cellOf(0)!.querySelector(".deck-volume")!;
    expect(key).toHaveClass("deck-volume-muted");
    expect(key).toHaveAttribute("data-state", "muted");
    expect(within(key as HTMLElement).getByText("Muted")).toBeInTheDocument();
  });

  it("does not look muted while its input is live", async () => {
    await openDeck([volume(0, 3, 1)]);
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "40%"));
    expect(cellOf(0)!.querySelector(".deck-volume")).not.toHaveClass("deck-volume-muted");
  });

  it("offers the + on the first cell no key covers", async () => {
    await openDeck([volume(0, 2, 1), stream(1), stream(2), stream(3), stream(4)]);
    expect(await screen.findByRole("button", { name: "Add a key at position 7" })).toBeInTheDocument();
  });

  it("swaps the span when the page is drawn transposed on an upright phone", async () => {
    setScreen({ width: 390, height: 844 });
    const { user } = await openDeck([volume(1, 3, 1)]);
    // Played on a phone the slider sits in the mixer; editing puts it back on its cells.
    await user.click(screen.getByRole("button", { name: "Edit keys" }));
    await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    // Stored row 0, column 1 is drawn on row 2, column 1, three columns wide.
    expect(cellOf(1)!.style.getPropertyValue("--cell-row")).toBe("2");
    expect(cellOf(1)!.style.getPropertyValue("--cell-column")).toBe("1");
    expect(cellOf(1)!.style.getPropertyValue("--row-span")).toBe("1");
    expect(cellOf(1)!.style.getPropertyValue("--column-span")).toBe("3");
    expect(cellOf(1)!.querySelector(".deck-volume")).not.toHaveClass("deck-volume-vertical");
  });

  it("sends the volume at most every 60 ms while dragging, then the final value on release", async () => {
    const { requests } = await openDeck([volume(0, 3, 1)]);
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    await waitFor(() => expect(slider).toHaveValue("40"));
    vi.useFakeTimers();

    fireEvent.pointerDown(slider, { pointerType: "touch", pointerId: 1 });
    fireEvent.change(slider, { target: { value: "50" } });
    fireEvent.change(slider, { target: { value: "55" } });
    fireEvent.change(slider, { target: { value: "60" } });
    expect(volumeRequests(requests)).toEqual([50]);
    act(() => void vi.advanceTimersByTime(60));
    expect(volumeRequests(requests)).toEqual([50, 60]);
    fireEvent.change(slider, { target: { value: "65" } });
    expect(slider).toHaveAttribute("aria-valuetext", "65%");
    fireEvent.pointerUp(slider, { pointerType: "touch", pointerId: 1 });
    expect(volumeRequests(requests)).toEqual([50, 60, 65]);
    act(() => void vi.advanceTimersByTime(200));
    expect(volumeRequests(requests)).toEqual([50, 60, 65]);
  });

  it("follows volume changes from OBS, except while the slider is held", async () => {
    const { emit } = await openDeck([volume(0, 3, 1)]);
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    await waitFor(() => expect(slider).toHaveValue("40"));

    act(() => emit({ type: "obs-input-volume", inputName: "Music", volumeMul: faderPositionToMultiplier(0.7) }));
    expect(slider).toHaveValue("70");
    act(() => emit({ type: "obs-input-volume", inputName: "Mic", volumeMul: 1 }));
    expect(slider).toHaveValue("70");

    fireEvent.pointerDown(slider, { pointerType: "touch", pointerId: 1 });
    act(() => emit({ type: "obs-input-volume", inputName: "Music", volumeMul: faderPositionToMultiplier(0.2) }));
    expect(slider).toHaveValue("70");
    fireEvent.pointerUp(slider, { pointerType: "touch", pointerId: 1 });
    act(() => emit({ type: "obs-input-volume", inputName: "Music", volumeMul: faderPositionToMultiplier(0.2) }));
    expect(slider).toHaveValue("20");
  });

  it("does not run, open its menu or move while the slider is held", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { requests } = await openDeck([volume(0, 3, 1), stream(1)]);
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    fireEvent.pointerDown(slider, { pointerType: "touch", pointerId: 1, clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(800));
    fireEvent.pointerUp(slider, { pointerType: "touch", pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(slider);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(requests.filter((request) => request.url === "/api/actions/execute")).toEqual([]);
    // The menu stays reachable from the key's options button.
    fireEvent.click(within(cellOf(0)!).getByRole("button", { name: "Options for key 1" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("carries Mute and Monitor buttons that run the OBS actions and show the OBS state", async () => {
    const executed = (requests: { url: string; body: unknown }[]) =>
      requests.filter((request) => request.url === "/api/actions/execute").map((request) => (request.body as { action: unknown }).action);
    const { requests, user } = await openDeck([volume(0, 3, 1), volume(1, 3, 1, "Mic")], {
      obs: { enabled: true, status: "connected", state: { currentScene: "Main", mutedInputs: ["Mic"], streaming: false, recording: false, monitoredInputs: ["Music"] } },
    } as Partial<DesktopState>);
    await waitFor(() => expect(screen.getByRole("slider", { name: "Music" })).toBeEnabled());
    const muteMusic = within(cellOf(0)!).getByRole("button", { name: "Mute Music" });
    const monitorMusic = within(cellOf(0)!).getByRole("button", { name: "Monitor Music" });
    expect(muteMusic).toHaveAttribute("aria-pressed", "false");
    expect(monitorMusic).toHaveAttribute("aria-pressed", "true");
    expect(within(cellOf(1)!).getByRole("button", { name: "Mute Mic" })).toHaveAttribute("aria-pressed", "true");
    expect(within(cellOf(1)!).getByRole("button", { name: "Monitor Mic" })).toHaveAttribute("aria-pressed", "false");

    await user.click(muteMusic);
    await user.click(monitorMusic);
    await waitFor(() =>
      expect(executed(requests)).toEqual([
        { type: "obs.toggleMute", inputName: "Music" },
        { type: "obs.toggleMonitor", inputName: "Music" },
      ]),
    );
  });

  it("disables Mute and Monitor while OBS is not connected", async () => {
    const state = desktopState();
    state.obs = { ...state.obs, status: "disconnected" };
    await openDeck([volume(0, 2, 1)], { obs: state.obs });
    await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    for (const name of ["Mute Music", "Monitor Music"]) {
      const button = within(cellOf(0)!).getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription("OBS is not connected.");
    }
  });

  it("is disabled with a reason when the input is not in OBS or OBS is not connected", async () => {
    await openDeck([volume(0, 2, 1), volume(1, 2, 1, "Gone")]);
    const gone = await screen.findByRole("slider", { name: "Gone" }, { timeout: 5000 });
    await waitFor(() => expect(gone).toBeDisabled());
    expect(within(cellOf(1)!).getByText("Not found in OBS.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("slider", { name: "Music" })).toBeEnabled());
  });

  it("is disabled while OBS is not connected", async () => {
    const state = desktopState();
    state.obs = { ...state.obs, status: "disconnected" };
    await openDeck([volume(0, 2, 1)], { obs: state.obs });
    const slider = await screen.findByRole("slider", { name: "Music" }, { timeout: 5000 });
    expect(slider).toBeDisabled();
    expect(within(cellOf(0)!).getByText("OBS is not connected.")).toBeInTheDocument();
  });

  it("needs the computer in phone-only mode", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), deckOf([volume(0, 2, 1)])] });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    const slider = await screen.findByRole("slider", { name: "Music" });
    expect(slider).toBeDisabled();
    expect(within(cellOf(0)!).getByText("Needs the computer app.")).toBeInTheDocument();
  });

  it("refuses moving a block where it does not fit and says why", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), deckOf([volume(0, 2, 1), stream(6)])] });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    await screen.findByRole("slider", { name: "Music" });
    fireEvent.click(within(cellOf(0)!).getByRole("button", { name: "Options for key 1" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Move to position"));
    await user.type(within(dialog).getByLabelText("Move to position"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    expect((await screen.findAllByText("There is no room for a key this size here.")).length).toBeGreaterThan(0);
    expect(cellOf(0)).not.toBeNull();
  });
});

describe("volume key editor", () => {
  const boards = [deckOf([volume(0)])];
  const render = (existing: Key) => {
    const onSave = vi.fn(async (_key: KeyInput) => true);
    renderWithLanguage(<KeyEditorForm slot={0} existing={existing} boardKind="deck" boards={boards} obs={null} onSave={onSave} onTest={() => {}} />);
    return onSave;
  };

  it("asks for the height and width of a volume key and saves them", async () => {
    const onSave = render(volume(0));
    const height = screen.getByLabelText("Height");
    expect(within(height).getAllByRole("option").map((option) => option.textContent)).toEqual(["1 row", "2 rows", "3 rows"]);
    expect(within(screen.getByLabelText("Width")).getAllByRole("option").map((option) => option.textContent)).toEqual(["1 column", "2 columns"]);
    fireEvent.change(height, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ slot: 0, span: { rows: 3, columns: 1 }, action: { type: "obs.inputVolume", inputName: "Music" } });
  });

  it("shows the stored size and offers no size for other actions", () => {
    render(volume(0, 2, 2));
    expect(screen.getByLabelText("Height")).toHaveValue("2");
    expect(screen.getByLabelText("Width")).toHaveValue("2");
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "obs.toggleMute" } });
    expect(screen.queryByLabelText("Height")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Width")).not.toBeInTheDocument();
  });
});
