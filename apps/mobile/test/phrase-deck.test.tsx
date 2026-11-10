import type { Phrase, PhraseRepository, SpeakOptions, Voice } from "@speak-bot/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/adapters/local-storage-settings-store";
import type { AppSpeechSynthesizer } from "../src/adapters/web-speech-synthesizer";
import { App } from "../src/app/App";
import { createDesktopServices, type AppServices } from "../src/app/composition-root";
import { boardsOf, createFakeFetch, FakeSocket, phraseFromKeyRequest, type RecordedRequest } from "./desktop-fakes";
import { goTo, memoryLanguageStore } from "./i18n-helpers";

class Synthesizer implements AppSpeechSynthesizer {
  readonly isSupported = true;
  readonly spoken: string[] = [];
  async speak(text: string, _options?: SpeakOptions) {
    this.spoken.push(text);
  }
  cancel() {}
  async listVoices(): Promise<Voice[]> {
    return [];
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
  async update(phrase: Phrase) {
    this.phrases = this.phrases.map((p) => (p.id === phrase.id ? phrase : p));
  }
  async delete(id: string) {
    this.phrases = this.phrases.filter((p) => p.id !== id);
  }
  async replaceAll(phrases: Phrase[]) {
    this.phrases = [...phrases];
  }
}

const water: Phrase = { id: "p1", text: "Water please", slot: 0, createdAt: 1 };
const tired: Phrase = { id: "p2", text: "I am tired", label: "Tired", slot: 1, createdAt: 2 };

function setupLocal(phrases: Phrase[] = [water, tired]) {
  const synthesizer = new Synthesizer();
  const repository = new MemoryRepository([...phrases]);
  let nextId = 0;
  const services: AppServices = {
    synthesizer,
    phrases: { repository, generateId: () => `id-${++nextId}`, now: () => 100 + nextId },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore("en"),
    isFirstRun: () => false,
  };
  render(<App services={services} />);
  return { synthesizer, repository, user: userEvent.setup() };
}

async function openPhrases(user: ReturnType<typeof userEvent.setup>) {
  await goTo(user, "Phrases");
  const deck = screen.getByRole("region", { name: "Saved phrases" });
  await within(deck).findByRole("button", { name: "Speak: Water please" });
  return deck;
}

function keysOf(deck: HTMLElement) {
  return within(within(deck).getByRole("list", { name: "Saved phrases" })).getAllByRole("button");
}

describe("phrase deck", () => {
  it("shows a page of 15 square keys, with a + on every empty key", async () => {
    const { user } = setupLocal();
    const deck = await openPhrases(user);

    const keys = keysOf(deck);
    expect(keys).toHaveLength(15);
    expect(keys[0]).toHaveAccessibleName("Speak: Water please");
    expect(keys[0]).toHaveTextContent("Water please");
    expect(keys[1]).toHaveAccessibleName("Speak: I am tired");
    expect(keys[1]).toHaveTextContent("Tired");
    expect(keys[2]).toHaveAccessibleName("Add a phrase to button 3");
    expect(keys[2]).toHaveTextContent("+");
    expect(within(deck).getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("speaks a phrase when its key is tapped", async () => {
    const { synthesizer, user } = setupLocal();
    const deck = await openPhrases(user);

    await user.click(within(deck).getByRole("button", { name: "Speak: I am tired" }));

    expect(synthesizer.spoken).toEqual(["I am tired"]);
  });

  it("pages through the deck and always leaves room to add another phrase", async () => {
    const full = Array.from({ length: 15 }, (_, slot): Phrase => ({ id: `f${slot}`, text: `Phrase ${slot + 1}`, slot, createdAt: slot }));
    const { user } = setupLocal([{ ...full[0]!, text: "Water please" }, ...full.slice(1)]);
    const deck = await openPhrases(user);

    expect(within(deck).getByText("Page 1 of 2")).toBeInTheDocument();
    expect(within(deck).getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(within(deck).getByRole("button", { name: "Next page" }));

    expect(within(deck).getByText("Page 2 of 2")).toBeInTheDocument();
    const keys = keysOf(deck);
    expect(keys).toHaveLength(15);
    expect(keys[0]).toHaveAccessibleName("Add a phrase to button 16");
    expect(within(deck).getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("adds a phrase to an empty key with the editor dialog and returns focus to the key", async () => {
    const { repository, user } = setupLocal();
    const deck = await openPhrases(user);
    const emptyKey = within(deck).getByRole("button", { name: "Add a phrase to button 4" });

    await user.click(emptyKey);
    const dialog = screen.getByRole("dialog", { name: "Add phrase · button 4" });
    expect(within(dialog).getByRole("textbox", { name: "Phrase text" })).toHaveFocus();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Phrase text" }), "See you later");
    await user.type(within(dialog).getByRole("textbox", { name: "Short label (optional)" }), "Bye");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(deck).findByRole("button", { name: "Speak: See you later" })).toHaveTextContent("Bye");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(repository.phrases).toContainEqual(expect.objectContaining({ text: "See you later", label: "Bye", slot: 3 }));
    expect(keysOf(deck)[3]).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Phrase saved.");
  });

  it("requires the phrase text and tests it aloud without saving", async () => {
    const { synthesizer, repository, user } = setupLocal();
    const deck = await openPhrases(user);

    await user.click(within(deck).getByRole("button", { name: "Add a phrase to button 3" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Phrase text" })).toHaveAttribute("maxlength", "1000");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Type the phrase text.");

    await user.type(within(dialog).getByRole("textbox", { name: "Phrase text" }), "Testing one two");
    await user.click(within(dialog).getByRole("button", { name: "Test" }));

    expect(synthesizer.spoken).toEqual(["Testing one two"]);
    expect(repository.phrases).toHaveLength(2);
  });

  it("closes the editor with Cancel or Escape without saving", async () => {
    const { repository, user } = setupLocal();
    const deck = await openPhrases(user);
    const key = within(deck).getByRole("button", { name: "Add a phrase to button 3" });

    await user.click(key);
    await user.type(screen.getByRole("textbox", { name: "Phrase text" }), "Nope");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(key).toHaveFocus();

    await user.click(key);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(key).toHaveFocus();
    expect(repository.phrases).toHaveLength(2);
  });

  it("edits a phrase in edit mode", async () => {
    const { synthesizer, repository, user } = setupLocal();
    const deck = await openPhrases(user);

    await user.click(within(deck).getByRole("button", { name: "Edit" }));
    await user.click(within(deck).getByRole("button", { name: "Edit phrase: I am tired" }));
    const dialog = screen.getByRole("dialog", { name: "Edit phrase · button 2" });
    expect(within(dialog).getByRole("textbox", { name: "Phrase text" })).toHaveValue("I am tired");
    expect(within(dialog).getByRole("textbox", { name: "Short label (optional)" })).toHaveValue("Tired");

    await user.clear(within(dialog).getByRole("textbox", { name: "Short label (optional)" }));
    await user.clear(within(dialog).getByRole("textbox", { name: "Phrase text" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Phrase text" }), "I am sleepy");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(deck).findByRole("button", { name: "Edit phrase: I am sleepy" })).toHaveTextContent("I am sleepy");
    expect(repository.phrases.find((p) => p.id === "p2")).toEqual({ id: "p2", text: "I am sleepy", slot: 1, createdAt: 2 });
    expect(synthesizer.spoken).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("Phrase updated.");
  });

  it("opens the editor from a key's context menu or a long press", async () => {
    const { synthesizer, user } = setupLocal();
    const deck = await openPhrases(user);
    const key = within(deck).getByRole("button", { name: "Speak: Water please" });

    fireEvent.contextMenu(key);
    expect(screen.getByRole("dialog", { name: "Edit phrase · button 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.pointerDown(key);
    await new Promise((resolve) => setTimeout(resolve, 600));
    fireEvent.pointerUp(key);
    fireEvent.click(key);
    expect(await screen.findByRole("dialog", { name: "Edit phrase · button 1" })).toBeInTheDocument();
    expect(synthesizer.spoken).toEqual([]);
  });

  it("deletes a phrase after an inline confirmation", async () => {
    const { repository, user } = setupLocal();
    const deck = await openPhrases(user);

    fireEvent.contextMenu(within(deck).getByRole("button", { name: "Speak: Water please" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const confirm = within(dialog).getByRole("group", { name: "Delete this phrase? This cannot be undone." });
    expect(within(confirm).getByRole("button", { name: "No, keep it" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "No, keep it" }));
    expect(repository.phrases).toHaveLength(2);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Yes, delete" }));

    expect(await within(deck).findByRole("button", { name: "Add a phrase to button 1" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(repository.phrases.map((p) => p.id)).toEqual(["p2"]);
  });

  it("keeps restoring the defaults in the edit toolbar", async () => {
    const { user } = setupLocal();
    const deck = await openPhrases(user);
    expect(within(deck).queryByRole("button", { name: "Restore default phrases" })).not.toBeInTheDocument();

    await user.click(within(deck).getByRole("button", { name: "Edit" }));

    expect(within(deck).getByRole("button", { name: "Restore default phrases" })).toBeInTheDocument();
  });

  it("shows the first five slots as quick phrases on the Speak section, without empty keys", async () => {
    const { synthesizer, user } = setupLocal([
      water,
      { ...tired, slot: 4 },
      { id: "p3", text: "Not quick", slot: 5, createdAt: 3 },
    ]);
    const quick = await screen.findByRole("region", { name: "Quick phrases" });
    await within(quick).findByRole("button", { name: "Speak: Water please" });

    expect(within(quick).getAllByRole("button").map((button) => button.textContent)).toEqual(["Water please", "Tired"]);
    await user.click(within(quick).getByRole("button", { name: "Speak: I am tired" }));
    expect(synthesizer.spoken).toEqual(["I am tired"]);
  });
});

function desktopRoute() {
  let phrases: Phrase[] = [{ id: "d1", text: "Hello from desktop", slot: 0, createdAt: 1 }];
  return (request: RecordedRequest) => {
    const key = `${request.method} ${request.url}`;
    switch (key) {
      case "GET /api/health":
        return { body: { ok: true, name: "speak-bot-desktop", capabilities: { platform: "darwin", engine: "say", supportsDeviceSelection: false } } };
      case "GET /api/boards":
        return { body: boardsOf(phrases) };
      case "GET /api/voices":
        return { body: [] };
      case "GET /api/settings":
        return { body: { voiceId: "", rate: 1, deviceId: "", language: "en", captionsVisible: true } };
      case "POST /api/speak":
        return { status: 202, body: { ok: true } };
      default: {
        const saved = phraseFromKeyRequest(request);
        if (!saved) return undefined;
        // Another device filled this key first.
        if (saved.text === "Race") return { status: 409, body: { error: "Slot 3 is already in use.", code: "slot-occupied" } };
        phrases = [...phrases.filter((p) => p.slot !== saved.slot), { id: `slot-${saved.slot}`, createdAt: saved.slot, ...saved }];
        return { body: request.body };
      }
    }
  };
}

function setupRemote() {
  FakeSocket.instances = [];
  const fake = createFakeFetch(desktopRoute());
  const local = new Synthesizer();
  const services: AppServices = {
    synthesizer: local,
    phrases: { repository: new MemoryRepository(), generateId: () => "new-id", now: () => 1 },
    settings: { load: () => DEFAULT_SETTINGS, save: () => {} },
    language: memoryLanguageStore("en"),
    isFirstRun: () => false,
    desktop: createDesktopServices({
      fetch: fake.fetch,
      createSocket: (url) => new FakeSocket(url),
      location: { protocol: "http:", host: "desktop:4545" },
      generateId: () => "new-id",
      targetStore: { load: () => null, save: () => {} },
    }),
  };
  render(<App services={services} />);
  return { requests: fake.requests, local, user: userEvent.setup() };
}

describe("phrase deck in Computer mode", () => {
  it("speaks, adds into the chosen slot and edits on the desktop", async () => {
    const { requests, local, user } = setupRemote();
    await goTo(user, "Phrases");
    const deck = screen.getByRole("region", { name: "Saved phrases" });

    await user.click(await within(deck).findByRole("button", { name: "Speak: Hello from desktop" }));
    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/speak", body: expect.objectContaining({ text: "Hello from desktop" }) }));

    await user.click(within(deck).getByRole("button", { name: "Add a phrase to button 3" }));
    await user.type(screen.getByRole("textbox", { name: "Phrase text" }), "Thanks for the raid");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await within(deck).findByRole("button", { name: "Speak: Thanks for the raid" })).toBeInTheDocument();
    expect(requests).toContainEqual(
      expect.objectContaining({ method: "PUT", url: "/api/boards/communication/keys/2", body: { action: { type: "voice.speak", text: "Thanks for the raid" } } }),
    );

    fireEvent.contextMenu(within(deck).getByRole("button", { name: "Speak: Hello from desktop" }));
    await user.type(screen.getByRole("textbox", { name: "Short label (optional)" }), "Hi");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await within(deck).findByRole("button", { name: "Speak: Hello from desktop" })).toHaveTextContent("Hi");
    expect(requests).toContainEqual({
      method: "PUT",
      url: "/api/boards/communication/keys/0",
      body: { label: "Hi", action: { type: "voice.speak", text: "Hello from desktop" }, replace: true },
    });
    expect(local.spoken).toEqual([]);
  });

  it("explains when another device already filled the key", async () => {
    const { user } = setupRemote();
    await goTo(user, "Phrases");
    const deck = screen.getByRole("region", { name: "Saved phrases" });
    await within(deck).findByRole("button", { name: "Speak: Hello from desktop" });

    await user.click(within(deck).getByRole("button", { name: "Add a phrase to button 4" }));
    await user.type(screen.getByRole("textbox", { name: "Phrase text" }), "Race");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That button already has a phrase.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
