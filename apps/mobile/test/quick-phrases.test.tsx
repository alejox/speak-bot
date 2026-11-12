import { QUICK_PHRASES_BY_LANGUAGE } from "@speed-deck/core";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, setScreen, speakKey } from "./app-fakes";
import { chooseBoard } from "./board-picker";
import { goTo } from "./i18n-helpers";

/*
 * jsdom cannot measure layout. Still manual: the strip is one row of four equal buttons at least 44px tall at
 * every width, and the keys under it still fit without scrolling.
 */
const boards = () => [
  boardOf("talk", "Talk", [speakKey(0, "Hi"), speakKey(20, "Far")]),
  boardOf("chat", "Chat", [speakKey(0, "Yo")]),
  boardOf("stream", "Stream", [{ slot: 0, action: { type: "obs.toggleStream" } }], "deck"),
];
const strip = () => screen.getByRole("group", { name: "Quick phrases" });
const stripTexts = () => within(strip()).getAllByRole("button").map((button) => button.textContent);
const grid = () => screen.getByRole("list", { name: /^Keys of/ });

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("quick phrases", () => {
  it("are four fixed answers per language", () => {
    expect(QUICK_PHRASES_BY_LANGUAGE).toEqual({ es: ["Sí", "No", "Espera", "Gracias"], en: ["Yes", "No", "Wait", "Thanks"] });
  });

  it("sit above the keys, outside the grid, the same on every page and Voice board", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(stripTexts()).toEqual(["Yes", "No", "Wait", "Thanks"]);
    expect(grid()).not.toContainElement(strip());
    expect(strip().compareDocumentPosition(grid()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(15);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("button", { name: "Far" });
    expect(stripTexts()).toEqual(["Yes", "No", "Wait", "Thanks"]);

    await chooseBoard(user, "Chat");
    await screen.findByRole("button", { name: "Yo" });
    expect(stripTexts()).toEqual(["Yes", "No", "Wait", "Thanks"]);
  });

  it("speak at one tap on this device, without joining the recent phrases", async () => {
    const { synthesizer } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    fireEvent.click(within(strip()).getByRole("button", { name: "Wait" }));
    expect(synthesizer.texts).toEqual(["Wait"]);
    expect(screen.queryByRole("region", { name: "Recent phrases" })).not.toBeInTheDocument();
  });

  it("speak through the computer the way a phrase key does", async () => {
    const { requests } = renderRemoteApp({ state: desktopState({ boards: boards() }) });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    fireEvent.click(within(strip()).getByRole("button", { name: "Thanks" }));
    expect(requests).toContainEqual({ method: "POST", url: "/api/actions/execute", body: { action: { type: "voice.speak", text: "Thanks" } } });
  });

  it("follow the voice language", async () => {
    renderLocalApp({ boards: boards(), language: "es" });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(within(screen.getByRole("group", { name: "Frases rápidas" })).getAllByRole("button").map((button) => button.textContent)).toEqual(["Sí", "No", "Espera", "Gracias"]);
  });

  it.each([
    { width: 390, height: 844 },
    { width: 915, height: 412 },
  ])("are not drawn on a phone at $width x $height: the Voice grid holds only full keys", async (size) => {
    setScreen(size);
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    expect(screen.queryByRole("group", { name: "Quick phrases" })).not.toBeInTheDocument();
  });

  it("are not shown in the Deck", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Board: Stream" });
    expect(screen.queryByRole("group", { name: "Quick phrases" })).not.toBeInTheDocument();
  });
});
