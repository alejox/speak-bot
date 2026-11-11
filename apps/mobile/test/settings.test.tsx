import type { SpeakOptions, Voice } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { groupVoicesByLanguage, voiceDisplayName, voiceLabel, voicesForLanguage } from "../src/app/voice-options";
import { LocalSynthesizer, renderLocalApp, renderRemoteApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const voice = (id: string, name: string, lang: string, isDefault = false): Voice => ({ id, name, lang, isDefault });

const VOICES: Voice[] = [
  voice("paulina", "Paulina (Spanish (Mexico))", "es-MX"),
  voice("bells", "Bells", "en-US"),
  voice("monica", "Mónica", "es-ES"),
  voice("amelie", "Amélie", "fr-FR"),
  voice("elvira", "Microsoft Elvira - Spanish (Spain)", "es-ES", true),
  voice("alex", "Alex", "en-US"),
];

const SPANISH_OPTIONS = ["Microsoft Elvira · Spanish (Spain)", "Mónica · Spanish (Spain)", "Paulina · Spanish (Mexico)"];
const AUTOMATIC = "Automatic (matches the language)";

const picker = () => screen.getByRole("combobox", { name: "Voice" });
const optionTexts = (container: HTMLElement) =>
  within(container)
    .getAllByRole("option")
    .map((option) => option.textContent);

/** Opens the settings of a device that speaks Spanish with an English interface. */
async function openSettings(options: Parameters<typeof renderLocalApp>[0] = {}) {
  const app = renderLocalApp({ voices: VOICES, settings: { voiceId: "", rate: 1, voiceLanguage: "es" }, ...options });
  await goTo(app.user, options.language === "es" ? "Ajustes" : "Settings");
  return app;
}

describe("Voice options", () => {
  it("keeps the voices of one language, the default first and then by name", () => {
    expect(voicesForLanguage(VOICES, "es").map((candidate) => candidate.id)).toEqual(["elvira", "monica", "paulina"]);
  });

  it("matches on the language part of the locale, whatever its separator or case", () => {
    const voices = [voice("a", "A", "es_MX"), voice("b", "B", "ES-es"), voice("c", "C", "en-US"), voice("d", "D", "es")];
    expect(voicesForLanguage(voices, "es").map((candidate) => candidate.id)).toEqual(["a", "b", "d"]);
  });

  it("removes the language the browser repeats inside the voice name", () => {
    expect(voiceDisplayName(voice("1", "Paulina (Spanish (Mexico))", "es-MX"), "en")).toBe("Paulina");
    expect(voiceDisplayName(voice("2", "Microsoft Elvira - Spanish (Spain)", "es-ES"), "en")).toBe("Microsoft Elvira");
    expect(voiceDisplayName(voice("3", "Google español de Estados Unidos", "es-US"), "en")).toBe("Google español de Estados Unidos");
    expect(voiceDisplayName(voice("4", "Samantha (Enhanced)", "en-US"), "en")).toBe("Samantha (Enhanced)");
    expect(voiceDisplayName(voice("5", "Mónica (es-ES)", "es-ES"), "en")).toBe("Mónica");
  });

  it("names the language and region in the interface language, or shows the code it cannot read", () => {
    expect(voiceLabel(voice("1", "Mónica", "es-ES"), "en")).toBe("Mónica · Spanish (Spain)");
    expect(voiceLabel(voice("1", "Mónica", "es_ES"), "es")).toBe("Mónica · Español (España)");
    expect(voiceLabel(voice("2", "Odd", "not a locale"), "en")).toBe("Odd · not a locale");
  });

  it("groups every voice by language, the spoken language first and the rest by name", () => {
    const groups = groupVoicesByLanguage(VOICES, "es", "en");
    expect(groups.map((group) => group.label)).toEqual(["Spanish", "English", "French"]);
    expect(groups[0]!.options.map((option) => option.label)).toEqual(["Microsoft Elvira · Spain", "Mónica · Spain", "Paulina · Mexico"]);
    expect(groups[1]!.options.map((option) => option.label)).toEqual(["Alex · United States", "Bells · United States"]);
  });
});

describe("Settings groups", () => {
  it("is organised as Voice, Appearance, Language and Remove ads", async () => {
    await openSettings();
    await screen.findByRole("option", { name: SPANISH_OPTIONS[0] });
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Voice", "Appearance", "Language", "Remove ads"]);
    expect(within(screen.getByRole("group", { name: "Voice" })).getByRole("combobox", { name: "Voice" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Voice" })).getByRole("slider", { name: /Speed/ })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Appearance" })).getByRole("combobox", { name: "Theme" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Language" })).getByRole("combobox", { name: "Language / Idioma" })).toBeInTheDocument();
  });

  it("puts where to speak in the Voice group on the computer", async () => {
    const { user } = renderRemoteApp({ hostname: "127.0.0.1" });
    await goTo(user, "Settings");
    const voiceGroup = screen.getByRole("group", { name: "Voice" });
    expect(within(voiceGroup).getByRole("combobox", { name: "Speak on" })).toBeInTheDocument();
    expect(await within(voiceGroup).findByRole("combobox", { name: "Output device" })).toBeInTheDocument();
  });

  it("names the groups in Spanish", async () => {
    await openSettings({ language: "es" });
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Voz", "Apariencia", "Idioma", "Quitar anuncios"]),
    );
    expect(await screen.findByRole("option", { name: "Mónica · Español (España)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mostrar voces en todos los idiomas" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Probar voz" })).toBeInTheDocument();
  });
});

describe("Voice picker", () => {
  it("offers only the voices of the speech language, after Automatic", async () => {
    await openSettings();
    await screen.findByRole("option", { name: SPANISH_OPTIONS[0] });
    expect(optionTexts(picker())).toEqual([AUTOMATIC, ...SPANISH_OPTIONS]);
    expect(picker()).toHaveDisplayValue(AUTOMATIC);
    expect(within(picker()).queryByRole("group")).not.toBeInTheDocument();
  });

  it("follows the interface language when no speech language was chosen", async () => {
    const { user } = renderLocalApp({ voices: VOICES });
    await goTo(user, "Settings");
    await screen.findByRole("option", { name: "Alex · English (United States)" });
    expect(optionTexts(picker())).toEqual([AUTOMATIC, "Alex · English (United States)", "Bells · English (United States)"]);
  });

  it("shows every voice grouped by language when asked to", async () => {
    const { user, getSettings } = await openSettings();
    await screen.findByRole("option", { name: SPANISH_OPTIONS[0] });
    const showAll = screen.getByRole("checkbox", { name: "Show voices in all languages" });
    expect(showAll).not.toBeChecked();
    await user.click(showAll);

    const groups = within(picker()).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("label"))).toEqual(["Spanish", "English", "French"]);
    expect(optionTexts(groups[0]!)).toEqual(["Microsoft Elvira · Spain", "Mónica · Spain", "Paulina · Mexico"]);
    expect(optionTexts(groups[2]!)).toEqual(["Amélie · France"]);
    expect(optionTexts(picker())[0]).toBe(AUTOMATIC);

    await user.selectOptions(picker(), "amelie");
    expect(getSettings()).toMatchObject({ voiceId: "amelie" });

    await user.click(showAll);
    expect(within(picker()).queryByRole("group")).not.toBeInTheDocument();
  });

  it("keeps a stored voice of another language visible and selected", async () => {
    await openSettings({ settings: { voiceId: "alex", rate: 1, voiceLanguage: "es" } });
    await screen.findByRole("option", { name: "Alex · English (United States)" });
    expect(picker()).toHaveValue("alex");
    expect(optionTexts(picker())).toEqual([AUTOMATIC, ...SPANISH_OPTIONS, "Alex · English (United States)"]);
  });

  it("explains that there are no voices instead of showing an empty list", async () => {
    await openSettings({ voices: [] });
    expect(await screen.findByText(/does not offer any voices/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Voice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Show voices in all languages" })).not.toBeInTheDocument();
  });
});

describe("Voice preview", () => {
  it("speaks a sample in the selected voice and speed", async () => {
    const { user, synthesizer } = await openSettings({ settings: { voiceId: "monica", rate: 1.3, voiceLanguage: "es" } });
    await screen.findByRole("option", { name: SPANISH_OPTIONS[1] });
    await user.click(screen.getByRole("button", { name: "Preview voice" }));
    // The sample is in the language of the voice, not of the interface.
    expect(synthesizer.spoken).toEqual([{ text: "Hola, así suena esta voz.", options: { voiceId: "monica", rate: 1.3 } }]);
  });

  it("speaks the English sample with an English voice", async () => {
    const { user, synthesizer } = await openSettings({ settings: { voiceId: "alex", rate: 1, voiceLanguage: "es" } });
    await screen.findByRole("option", { name: "Alex · English (United States)" });
    await user.click(screen.getByRole("button", { name: "Preview voice" }));
    expect(synthesizer.spoken).toEqual([{ text: "Hello, this is how this voice sounds.", options: { voiceId: "alex", rate: 1 } }]);
  });

  it("is disabled while speaking", async () => {
    /** Speech that only ends when the test says so. */
    class SlowSynthesizer extends LocalSynthesizer {
      finish: () => void = () => {};
      override speak(text: string, options?: SpeakOptions) {
        void super.speak(text, options);
        return new Promise<void>((resolve) => (this.finish = resolve));
      }
    }
    const synthesizer = new SlowSynthesizer(VOICES);
    const { user } = await openSettings({ synthesizer });
    const preview = screen.getByRole("button", { name: "Preview voice" });
    expect(preview).toBeEnabled();
    await user.click(preview);
    expect(preview).toBeDisabled();
    synthesizer.finish();
    await waitFor(() => expect(preview).toBeEnabled());
    expect(synthesizer.texts).toHaveLength(1);
  });

  it("asks the computer to speak the sample when speaking there", async () => {
    const { user, requests } = renderRemoteApp();
    await goTo(user, "Settings");
    await screen.findByRole("option", { name: "Alex · English (United States)" });
    await user.click(screen.getByRole("button", { name: "Preview voice" }));
    await waitFor(() => expect(requests.some((request) => request.method === "POST" && request.url === "/api/speak")).toBe(true));
    expect(requests.find((request) => request.url === "/api/speak")?.body).toMatchObject({ text: "Hello, this is how this voice sounds." });
  });
});

describe("Speed", () => {
  it("shows its value and its limits", async () => {
    await openSettings({ settings: { voiceId: "", rate: 1.3, voiceLanguage: "es" } });
    const slider = screen.getByRole("slider", { name: /Speed/ });
    expect(slider).toHaveAttribute("min", "0.5");
    expect(slider).toHaveAttribute("max", "2");
    expect(slider).toHaveAttribute("step", "0.1");
    expect(slider).toHaveAttribute("aria-valuetext", "1.3×");
    expect(slider).toHaveAccessibleName("Speed 1.3×");
    expect(screen.getByText("0.5×")).toBeInTheDocument();
    expect(screen.getByText("2.0×")).toBeInTheDocument();
  });
});
