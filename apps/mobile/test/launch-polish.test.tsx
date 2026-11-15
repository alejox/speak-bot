import type { Key, Voice } from "@speed-deck/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { DeviceSignals } from "../src/adapters/device-signals";
import { createDeviceSignals } from "../src/adapters/device-signals";
import { App } from "../src/app/App";
import { groupVoicesByLanguage, uniqueVoices, voiceLabel } from "../src/app/voice-options";
import { boardOf, desktopState, remoteServices, renderLocalApp, renderRemoteApp, setScreen, setWideScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const twoPages = () => [boardOf("talk", "Talk", [speakKey(0, "Hi"), speakKey(15, "Later")])];
const sceneKey = (slot: number): Key => ({ slot, action: { type: "obs.switchScene", sceneName: `Scene ${slot}` } });

describe("a dialog's status", () => {
  it("starts empty instead of repeating what an earlier action said", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(screen.getByRole("button", { name: "Save as key" }));
    expect(screen.getByRole("status")).toHaveTextContent("Type something to save it on a key.");

    await user.click(screen.getByRole("button", { name: "Grid size" }));
    const gridDialog = screen.getByRole("dialog", { name: /Grid/ });
    expect(within(gridDialog).getByRole("status")).toBeEmptyDOMElement();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Board: Talk" }));
    await user.click(screen.getByRole("menuitem", { name: "New board" }));
    expect(within(screen.getByRole("dialog", { name: "New board" })).getByRole("status")).toBeEmptyDOMElement();
  });

  it("still says what happens while it is open", async () => {
    const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])], gridFull: true });
    const { user } = renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await user.click(screen.getByRole("button", { name: "Grid size" }));
    const dialog = screen.getByRole("dialog", { name: /Grid/ });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(dialog).getByRole("status")).not.toBeEmptyDOMElement());
  });
});

describe("the New board dialog", () => {
  it("has its suggested name selected, so typing replaces it", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(screen.getByRole("button", { name: "Board: Talk" }));
    await user.click(screen.getByRole("menuitem", { name: "New board" }));
    const name = within(screen.getByRole("dialog", { name: "New board" })).getByRole<HTMLInputElement>("textbox", { name: "Name" });
    expect(name).toHaveFocus();
    expect(name.value).not.toBe("");
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, name.value.length]);
    await user.keyboard("Games");
    expect(name).toHaveValue("Games");
  });
});

describe("the voice picker", () => {
  const monica: Voice = { id: "Mónica (Español (España))", name: "Mónica (Español (España))", lang: "es-ES", isDefault: false };
  const eddy: Voice = { id: "Eddy (Alemán (Alemania))", name: "Eddy (Alemán (Alemania))", lang: "de-DE", isDefault: false };
  const daniel: Voice = { id: "Daniel (Enhanced)", name: "Daniel (Enhanced)", lang: "en-GB", isDefault: false };

  it("lists a voice the computer reports twice only once", async () => {
    const { user } = renderLocalApp({ voices: [monica, { ...monica }, daniel], settings: { voiceId: "", rate: 1, voiceLanguage: "es" } });
    await goTo(user, "Settings");
    const picker = await screen.findByRole("combobox", { name: "Voice" });
    await waitFor(() => expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual(["Automatic (matches the language)", "Mónica · Spanish (Spain)"]));
    await user.click(screen.getByRole("checkbox", { name: "Show voices in all languages" }));
    const all = within(picker).getAllByRole("option").map((option) => option.textContent);
    expect(all.filter((label) => label?.startsWith("Mónica"))).toEqual(["Mónica · Spain"]);
    expect(uniqueVoices([monica, { ...monica }, daniel])).toEqual([monica, daniel]);
  });

  it("does not repeat the language a system voice carries in its name, whatever language the system wrote it in", () => {
    expect(voiceLabel(monica, "en")).toBe("Mónica · Spanish (Spain)");
    expect(voiceLabel(monica, "es")).toBe("Mónica · Español (España)");
    expect(voiceLabel(eddy, "en")).toBe("Eddy · German (Germany)");
    // What tells two voices apart stays.
    expect(voiceLabel(daniel, "en")).toBe("Daniel (Enhanced) · English (United Kingdom)");
    expect(groupVoicesByLanguage([monica, { ...monica }], "es", "en")[0]!.options).toEqual([{ id: monica.id, label: "Mónica · Spain" }]);
  });
});

describe("Vibrate on disconnect", () => {
  const device = (canVibrate: boolean | undefined): DeviceSignals => ({ vibrate: () => {}, computerName: () => null, ...(canVibrate === undefined ? {} : { canVibrate: () => canVibrate }) });
  const openSettings = async (hostname: string, signals: DeviceSignals) => {
    const remote = remoteServices({ hostname });
    render(<App services={{ ...remote.services, device: signals }} />);
    await screen.findByRole("link", { name: "Voice" });
    await goTo(userEvent.setup(), "Settings");
    await screen.findByRole("combobox", { name: "Speak on" });
  };

  it("is offered on a paired phone that can vibrate", async () => {
    await openSettings("192.168.1.20", device(true));
    expect(screen.getByRole("checkbox", { name: "Vibrate on disconnect" })).toBeInTheDocument();
  });

  it("is not offered in the computer's own window, which cannot vibrate", async () => {
    await openSettings("127.0.0.1", device(true));
    expect(screen.queryByRole("checkbox", { name: "Vibrate on disconnect" })).not.toBeInTheDocument();
  });

  it("is not offered on a paired device that cannot vibrate", async () => {
    await openSettings("192.168.1.20", device(false));
    expect(screen.queryByRole("checkbox", { name: "Vibrate on disconnect" })).not.toBeInTheDocument();
  });

  it("knows a device can vibrate from the Android app or from a touch browser with the vibration API", () => {
    expect(createDeviceSignals({ SpeedDeckAndroidDevice: { vibrate: () => true, computerName: () => "" } }).canVibrate?.()).toBe(true);
    expect(createDeviceSignals({ navigator: { vibrate: () => true, maxTouchPoints: 5 } }).canVibrate?.()).toBe(true);
    // A laptop's browser has the API and nothing that vibrates; an iPhone's has no API at all.
    expect(createDeviceSignals({ navigator: { vibrate: () => true, maxTouchPoints: 0 } }).canVibrate?.()).toBe(false);
    expect(createDeviceSignals({ navigator: { maxTouchPoints: 5 } }).canVibrate?.()).toBe(false);
  });
});

describe("the page indicator", () => {
  afterEach(() => setWideScreen(false));

  it("shows which page is on screen next to the pager, in Voice", async () => {
    const { user } = renderLocalApp({ boards: twoPages() });
    await screen.findByRole("button", { name: "Hi" });
    const shown = screen.getByText("1 / 2");
    expect(shown).toHaveAttribute("aria-hidden", "true");
    expect(shown).not.toHaveClass("visually-hidden");
    expect(shown.closest(".deck-pager")).not.toBeNull();
    // The words stay for screen readers.
    expect(screen.getByText("Page 1 of 2")).toHaveClass("visually-hidden");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("shows it in the Deck too", async () => {
    setWideScreen(false);
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [sceneKey(0), sceneKey(15)], "deck")] });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    await screen.findByRole("button", { name: "Scene 0" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("shows it beside the Voice actions on a phone", async () => {
    setScreen({ width: 412, height: 915 });
    renderLocalApp({ boards: twoPages() });
    await screen.findByRole("button", { name: "Hi" });
    const shown = screen.getByText("1 / 2");
    expect(shown).toHaveAttribute("aria-hidden", "true");
    expect(shown.closest(".voice-actions")).not.toBeNull();
    expect(screen.getByText("Page 1 of 2")).toHaveClass("visually-hidden");
  });

  it("is not shown for a board with one page", async () => {
    renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });
});

describe("Stop and Clear in Voice", () => {
  afterEach(() => setWideScreen(false));

  it("draws Stop with a stop sign, not an empty square that reads as a checkbox", async () => {
    renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(stop.querySelector("svg.lucide-circle-stop")).not.toBeNull();
    expect(stop.querySelector("svg.lucide-square")).toBeNull();
  });

  it("names the Clear control beside the recent phrases, with a visible label and a tooltip", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await user.type(screen.getByRole("textbox", { name: "Text to speak" }), "See you");
    await user.click(screen.getByRole("button", { name: "Speak" }));
    const clear = await screen.findByRole("button", { name: "Clear recent phrases" });
    expect(clear).toHaveTextContent("Clear");
    expect(clear).toHaveAttribute("title", "Clear recent phrases");
  });
});
