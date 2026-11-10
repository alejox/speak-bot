import { DEFAULT_PHRASE_TEXTS, type Phrase, type PhraseRepository, type SpeakOptions, type Voice } from "@speak-bot/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type SpeechSettings } from "../src/adapters/local-storage-settings-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { goTo, memoryLanguageStore } from "./i18n-helpers";
import type { AppServices } from "../src/app/composition-root";

class FakeSynthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: Array<{ text: string; options: SpeakOptions | undefined }> = [];
  async speak(text: string, options?: SpeakOptions) {
    this.spoken.push({ text, options });
  }
  cancel() {}
  async listVoices(): Promise<Voice[]> {
    return [{ id: "v1", name: "Alex", lang: "en-US", isDefault: true }];
  }
  onVoicesChanged() {
    return () => {};
  }
}

class MemoryRepository implements PhraseRepository {
  constructor(public phrases: Phrase[] = []) {}
  async list() {
    return [...this.phrases];
  }
  async save(phrase: Phrase) {
    this.phrases = [...this.phrases.filter((p) => p.id !== phrase.id), phrase];
  }
  async delete(id: string) {
    this.phrases = this.phrases.filter((p) => p.id !== id);
  }
  async replaceAll(phrases: Phrase[]) {
    this.phrases = [...phrases];
  }
}

function setup({ phrases, firstRun = false, settings = DEFAULT_SETTINGS }: {
  phrases?: Phrase[];
  firstRun?: boolean;
  settings?: SpeechSettings;
} = {}) {
  const synthesizer = new FakeSynthesizer();
  const repository = new MemoryRepository(phrases);
  let nextId = 0;
  let saved = settings;
  const services: AppServices = {
    synthesizer,
    phrases: { repository, generateId: () => `id-${++nextId}`, now: () => nextId },
    settings: { load: () => saved, save: (next) => void (saved = next) },
    isFirstRun: () => firstRun,
    language: memoryLanguageStore("en"),
  };
  render(<App services={services} />);
  return { synthesizer, repository, user: userEvent.setup(), getSavedSettings: () => saved };
}

describe("App", () => {
  it("speaks the typed text when Speak is pressed", async () => {
    const { synthesizer, user } = setup({ settings: { voiceId: "v1", rate: 1.3 } });

    await user.type(screen.getByLabelText("Text to speak"), "Hello world");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    expect(synthesizer.spoken).toEqual([{ text: "Hello world", options: { voiceId: "v1", rate: 1.3 } }]);
  });

  it("speaks on Enter and inserts a new line on Shift+Enter", async () => {
    const { synthesizer, user } = setup();
    const textArea = screen.getByLabelText("Text to speak");

    await user.type(textArea, "Line one{Shift>}{Enter}{/Shift}Line two{Enter}");

    expect(synthesizer.spoken.map((s) => s.text)).toEqual(["Line one\nLine two"]);
  });

  it("asks for text instead of speaking when empty", async () => {
    const { synthesizer, user } = setup();

    await user.click(screen.getByRole("button", { name: "Speak" }));

    expect(await screen.findByText("Type something to speak first.")).toBeInTheDocument();
    expect(synthesizer.spoken).toEqual([]);
  });

  it("seeds default phrases on first run and speaks a phrase on tap", async () => {
    const { synthesizer, user } = setup({ firstRun: true });
    await goTo(user, "Phrases");

    const phraseButtons = await screen.findAllByRole("button", { name: /^Speak: / });
    expect(phraseButtons).toHaveLength(DEFAULT_PHRASE_TEXTS.length);

    await user.click(screen.getByRole("button", { name: "Speak: Thank you" }));
    expect(synthesizer.spoken.map((s) => s.text)).toEqual(["Thank you"]);
  });

  it("saves the typed text as a phrase and deletes it in edit mode", async () => {
    const { repository, user } = setup();

    await user.type(screen.getByLabelText("Text to speak"), "I need water");
    await user.click(screen.getByRole("button", { name: "Save as phrase" }));
    expect(await screen.findByRole("button", { name: "Speak: I need water" })).toBeInTheDocument();
    expect(repository.phrases.map((p) => p.text)).toEqual(["I need water"]);

    await goTo(user, "Phrases");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const phrases = screen.getByRole("region", { name: "Saved phrases" });
    await user.click(within(phrases).getByRole("button", { name: "Delete phrase: I need water" }));

    expect(
      await within(phrases).findByText("No saved phrases yet. Press “Edit” to add one or restore the default ones."),
    ).toBeInTheDocument();
    expect(repository.phrases).toEqual([]);
  });

  it("persists the selected voice and rate", async () => {
    const { user, getSavedSettings } = setup();
    await goTo(user, "Settings");

    await user.selectOptions(await screen.findByRole("combobox", { name: "Voice" }), "v1");

    expect(getSavedSettings()).toEqual({ voiceId: "v1", rate: 1 });
  });
});
