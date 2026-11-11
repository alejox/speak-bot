import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPOSING_IDLE_MS, COMPOSING_REFRESH_MS } from "../src/app/use-composing-signal";
import { boardOf, desktopState, renderRemoteApp, speakKey } from "./app-fakes";
import type { RecordedRequest } from "./desktop-fakes";
import { goTo } from "./i18n-helpers";

const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [], "deck")];
const field = () => screen.getByRole("textbox", { name: "Text to speak" });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const composing = (requests: readonly RecordedRequest[]) => requests.filter((request) => request.url === "/api/composing");
const flags = (requests: readonly RecordedRequest[]) => composing(requests).map((request) => (request.body as { composing: boolean }).composing);

async function openVoice(options: Parameters<typeof renderRemoteApp>[0] = {}) {
  const rendered = renderRemoteApp({ state: desktopState({ boards: boards() }), ...options });
  await screen.findByRole("button", { name: /^(Hi|Local phrase)$/ });
  return rendered;
}

describe("telling the computer that someone is typing", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("sends the flag when the text starts and when it is emptied, never the text, and only on changes", async () => {
    const { requests } = await openVoice();
    type("H");
    type("Ho");
    type("Hola");
    expect(composing(requests)).toEqual([{ method: "PUT", url: "/api/composing", body: { composing: true } }]);
    type("");
    expect(flags(requests)).toEqual([true, false]);
    type("");
    expect(flags(requests)).toEqual([true, false]);
  });

  it("turns off after a while without a keystroke and on again at the next one", async () => {
    const { requests } = await openVoice();
    type("Hola");
    act(() => void vi.advanceTimersByTime(COMPOSING_IDLE_MS - 1));
    expect(flags(requests)).toEqual([true]);
    act(() => void vi.advanceTimersByTime(1));
    expect(flags(requests)).toEqual([true, false]);
    type("Hola a");
    expect(flags(requests)).toEqual([true, false, true]);
  });

  it("refreshes the flag while the typing goes on, so the computer does not let it expire", async () => {
    const { requests } = await openVoice();
    type("a");
    act(() => void vi.advanceTimersByTime(COMPOSING_REFRESH_MS - 1));
    type("ab");
    expect(flags(requests)).toEqual([true]);
    act(() => void vi.advanceTimersByTime(1));
    type("abc");
    expect(flags(requests)).toEqual([true, true]);
  });

  it("turns off when the text is spoken, with the button or with Enter", async () => {
    const { requests } = await openVoice();
    type("Hola");
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    expect(flags(requests)).toEqual([true, false]);
    type("Hola otra vez");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(flags(requests)).toEqual([true, false, true, false]);
  });

  it("turns off when the composer goes away", async () => {
    const { requests, user } = await openVoice();
    type("Hola");
    await goTo(user, "Settings");
    expect(flags(requests)).toEqual([true, false]);
  });

  it("sends nothing while this device speaks", async () => {
    const { requests } = await openVoice({ storedTarget: "device" });
    type("Hola");
    type("");
    expect(composing(requests)).toEqual([]);
  });
});
