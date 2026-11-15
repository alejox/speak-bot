import type { Key } from "@speed-deck/core";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopApiClient, DesktopRequestError, SPEAK_REQUEST_TIMEOUT_MS } from "../src/adapters/desktop-api";
import { computerDidNotAnswer } from "../src/app/use-speech";
import { boardOf, desktopState, LocalSynthesizer, renderRemoteApp, setScreen, setWideScreen, speakKey } from "./app-fakes";
import { FakeSocket } from "./desktop-fakes";
import { goTo } from "./i18n-helpers";

const NOTICE = "Spoken on this device: the computer could not be reached.";
const NO_VOICE = "The computer could not be reached and this device has no voice. Nothing was said.";
const sceneKey: Key = { slot: 0, action: { type: "obs.switchScene", sceneName: "Main" } };
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [sceneKey], "deck")];
const phone = () => setScreen({ width: 412, height: 915 });
const executed = (requests: readonly { method: string; url: string }[]) => requests.filter((request) => request.url === "/api/actions/execute" || request.url === "/api/speak");
/** The toast is for the eye; the status region next to it is what a screen reader hears. */
const announcements = (text: string) => screen.getAllByRole("status").filter((region) => region.textContent === text);

async function openPairedPhone(options: Parameters<typeof renderRemoteApp>[0] = {}) {
  const remote = renderRemoteApp({ state: desktopState({ boards: boards() }), ...options });
  await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
  return remote;
}

describe("Voice on a paired phone when the computer cannot be reached", () => {
  afterEach(() => setWideScreen(false));

  it("says a typed phrase with this device's voice, says so where it shows, and keeps Speak on as it was", async () => {
    const { state, local, user, getTarget } = await openPairedPhone();
    state.unreachable = true;
    await user.type(screen.getByRole("textbox", { name: "Text to speak" }), "I need help");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    await waitFor(() => expect(local.texts).toEqual(["I need help"]));
    await waitFor(() => expect(announcements(NOTICE)).toHaveLength(1));
    expect(announcements(NOTICE)[0]).not.toHaveClass("visually-hidden");
    expect(getTarget()).toBeNull();

    state.unreachable = false;
    await goTo(user, "Settings");
    expect(await screen.findByRole("combobox", { name: "Speak on" })).toHaveValue("computer");
  });

  it("says a phrase key with this device's voice and shows a notice that neither moves the keys nor takes focus", async () => {
    phone();
    const { state, local, user } = await openPairedPhone();
    state.unreachable = true;
    const key = screen.getByRole("button", { name: "Hi" });
    await user.click(key);

    await waitFor(() => expect(local.texts).toEqual(["Hi"]));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent(NOTICE);
    expect(toast).not.toHaveClass("visually-hidden");
    expect(toast).toHaveAttribute("aria-hidden", "true");
    // Announced once: by the status region, never a second time by the toast.
    expect(announcements(NOTICE)).toHaveLength(1);
    expect(key).toHaveFocus();
  });

  it("does not wait for a request to fail once the link is known to be lost: the phrase is said inside the tap", async () => {
    phone();
    const { local, requests, user } = await openPairedPhone();
    act(() => FakeSocket.instances.at(-1)!.open());
    act(() => FakeSocket.instances.at(-1)!.close());
    const before = executed(requests).length;
    await user.click(screen.getByRole("button", { name: "Hi" }));

    expect(local.texts).toEqual(["Hi"]);
    expect(executed(requests)).toHaveLength(before);
    expect(await screen.findByTestId("toast")).toHaveTextContent(NOTICE);
  });

  it("shows a visible error when this device has no voice either, and keeps the typed phrase to try again", async () => {
    const silent = new LocalSynthesizer();
    silent.isSupported = false;
    const { state, local, user } = await openPairedPhone({ synthesizer: silent });
    state.unreachable = true;
    const box = screen.getByRole("textbox", { name: "Text to speak" });
    await user.type(box, "I need help");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    await waitFor(() => expect(announcements(NO_VOICE)).toHaveLength(1));
    expect(announcements(NO_VOICE)[0]).not.toHaveClass("visually-hidden");
    expect(local.texts).toEqual([]);
    expect(box).toHaveValue("I need help");
  });

  it("shows that error on a phone where the person is looking: over the keys", async () => {
    phone();
    const silent = new LocalSynthesizer();
    silent.isSupported = false;
    const { state, local, user } = await openPairedPhone({ synthesizer: silent });
    state.unreachable = true;
    await user.click(screen.getByRole("button", { name: "Hi" }));

    expect(await screen.findByTestId("toast")).toHaveTextContent(NO_VOICE);
    expect(local.texts).toEqual([]);
    expect(screen.getByRole("button", { name: "Hi" })).toBeInTheDocument();
  });

  it("does not talk over the computer when it answered that its queue is full", async () => {
    const { state, local, user } = await openPairedPhone();
    state.speak = { status: 429, body: { error: "Full.", code: "queue-full" } };
    await user.type(screen.getByRole("textbox", { name: "Text to speak" }), "I need help");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    await waitFor(() => expect(announcements("Too many phrases are waiting. Wait for one to be spoken.")).toHaveLength(1));
    expect(local.texts).toEqual([]);
  });
});

describe("asking a computer that never answers to speak", () => {
  afterEach(() => vi.useRealTimers());

  /** A network that swallows the request: nothing comes back until the request is given up. */
  const silentFetch = ((_input: RequestInfo | URL, init: RequestInit = {}) =>
    new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as typeof fetch;

  it("gives up after a few seconds, as a computer that did not answer, for typed text and for a phrase key", async () => {
    vi.useFakeTimers();
    const client = new DesktopApiClient(silentFetch);
    const outcomes: unknown[] = [];
    void client.speak({ text: "Hi" }).catch((error: unknown) => outcomes.push(error));
    void client.executeAction({ type: "voice.speak", text: "Hi" }).catch((error: unknown) => outcomes.push(error));
    await vi.advanceTimersByTimeAsync(SPEAK_REQUEST_TIMEOUT_MS - 1);
    expect(outcomes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every(computerDidNotAnswer)).toBe(true);
  });

  it("tells a computer that answered with a reason from one that did not answer", () => {
    expect(computerDidNotAnswer(new TypeError("Failed to fetch"))).toBe(true);
    expect(computerDidNotAnswer(new DesktopRequestError(502, "Bad gateway."))).toBe(true);
    expect(computerDidNotAnswer(new DesktopRequestError(429, "Full.", "queue-full"))).toBe(false);
    expect(computerDidNotAnswer(new DesktopRequestError(400, "text is required."))).toBe(false);
  });
});

describe("a key that fails on a phone", () => {
  afterEach(() => setWideScreen(false));

  it("says why in a visible message, announced once", async () => {
    phone();
    const state = desktopState({ boards: boards() });
    state.execute["obs.switchScene"] = { status: 502, body: { error: "No.", code: "obs-request-failed" } };
    const { user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    await user.click(await screen.findByRole("button", { name: "Main" }));

    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("OBS could not do that. Check that the name exists.");
    expect(toast).not.toHaveClass("visually-hidden");
    expect(announcements("OBS could not do that. Check that the name exists.")).toHaveLength(1);
  });

  it("shows nothing over the keys for a key that worked", async () => {
    phone();
    const { user } = await openPairedPhone();
    await user.click(screen.getByRole("button", { name: "Hi" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Hi" })).toBeInTheDocument());
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });
});
