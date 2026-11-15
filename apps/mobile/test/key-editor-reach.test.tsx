import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyEditorForm } from "../src/components/KeyEditorForm";
import { boardOf, renderLocalApp, setWideScreen, speakKey } from "./app-fakes";
import { renderWithLanguage } from "./i18n-helpers";

const grid = () => screen.getByRole("list", { name: /^Keys of/ });
const inspector = () => screen.getByRole("complementary", { name: /^Key \d+/ });
const queryInspector = () => screen.queryByRole("complementary", { name: /^Key \d+/ });
const boards = () => [boardOf("main", "Main", [speakKey(0, "Hello")])];
/** True when `first` comes before `second` in the document, which is the order Tab follows. */
const precedes = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

async function openInspector() {
  const app = renderLocalApp({ boards: boards() });
  const key = await screen.findByRole("button", { name: "Hello" });
  key.focus();
  fireEvent.contextMenu(key);
  await app.user.click(screen.getByRole("menuitem", { name: "Edit" }));
  return { ...app, panel: inspector() };
}

describe("the key inspector from the keyboard", () => {
  beforeEach(() => setWideScreen(true));
  afterEach(() => setWideScreen(false));

  it("saves with Enter in a single-line field", async () => {
    const { user, panel } = await openInspector();
    await user.type(within(panel).getByRole("textbox", { name: "Label (optional)" }), "Hi{Enter}");
    expect(await within(grid()).findByRole("button", { name: "Hi" })).toBeInTheDocument();
  });

  it("saves with Enter in the phrase box, like the composer speaks, and keeps Shift+Enter for a new line", async () => {
    const { user, panel } = await openInspector();
    const phrase = within(panel).getByRole("textbox", { name: "Text to say" });
    await user.type(phrase, "{Shift>}{Enter}{/Shift}there");
    expect(phrase).toHaveValue("Hello\nthere");
    expect(within(grid()).queryByRole("button", { name: /there/ })).not.toBeInTheDocument();
    await user.type(phrase, "{Enter}");
    expect(await within(grid()).findByRole("button", { name: /Hello\s+there/ })).toBeInTheDocument();
    expect(phrase).toHaveValue("Hello\nthere");
  });

  it("closes with Escape, asking nothing when nothing changed, and gives focus back to the key", async () => {
    const { user } = await openInspector();
    await user.keyboard("{Escape}");
    expect(queryInspector()).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "Hello" })).toHaveFocus();
  });

  it("gives focus back to the key from the Close button too", async () => {
    const { user, panel } = await openInspector();
    await user.click(within(panel).getByRole("button", { name: "Close" }));
    expect(queryInspector()).not.toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "Hello" })).toHaveFocus();
  });

  it("asks before Escape throws away an edited draft, and can keep editing it", async () => {
    const { user, panel } = await openInspector();
    const label = within(panel).getByRole("textbox", { name: "Label (optional)" });
    await user.type(label, "Hi");
    await user.keyboard("{Escape}");
    const question = screen.getByRole("dialog", { name: "Discard the changes to this key?" });
    await user.click(within(question).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(inspector()).getByRole("textbox", { name: "Label (optional)" })).toHaveValue("Hi");

    await user.click(within(inspector()).getByRole("button", { name: "Close" }));
    await user.click(within(screen.getByRole("dialog", { name: "Discard the changes to this key?" })).getByRole("button", { name: "Discard" }));
    expect(queryInspector()).not.toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "Hello" })).toBeInTheDocument();
    expect(within(grid()).queryByRole("button", { name: "Hi" })).not.toBeInTheDocument();
  });

  it("follows the order on screen with Tab: action, phrase, icon, colour, label, move, then Save and Test last", async () => {
    const { panel } = await openInspector();
    const inPanel = within(panel);
    const order = [
      inPanel.getByRole("combobox", { name: "Action" }),
      inPanel.getByRole("textbox", { name: "Text to say" }),
      inPanel.getByRole("radio", { name: "Default" }),
      inPanel.getByRole("radio", { name: "No color" }),
      inPanel.getByRole("textbox", { name: "Label (optional)" }),
      inPanel.getByRole("spinbutton", { name: "Move to position" }),
      inPanel.getByRole("button", { name: "Save" }),
      inPanel.getByRole("button", { name: "Test" }),
    ];
    order.slice(1).forEach((control, index) => expect(precedes(order[index]!, control), `${index}: ${control.outerHTML.slice(0, 60)}`).toBe(true));
    // The actions are a footer of their own, so the styles can keep it in view while the fields scroll.
    const footer = inPanel.getByRole("button", { name: "Save" }).closest(".key-editor-footer");
    expect(footer).not.toBeNull();
    expect(footer).toContainElement(inPanel.getByRole("button", { name: "Test" }));
    expect(footer!.parentElement!.lastElementChild).toBe(footer);
    expect(footer!.parentElement).toHaveClass("key-editor");
  });
});

describe("the cell a key is being added to or edited on", () => {
  afterEach(() => setWideScreen(false));

  it("is marked in the grid while its action is picked and while the inspector is open", async () => {
    setWideScreen(true);
    const { user } = renderLocalApp({ boards: boards() });
    const cell = () => screen.getByRole("button", { name: "Add a key at position 2" });
    await screen.findByRole("button", { name: "Hello" });
    expect(cell()).not.toHaveClass("deck-key-selected");
    await user.click(cell());
    expect(cell()).toHaveClass("deck-key-selected");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Go to page" }));
    expect(inspector()).toHaveAccessibleName("Key 2");
    expect(cell()).toHaveClass("deck-key-selected");
    await user.keyboard("{Escape}");
    expect(cell()).not.toHaveClass("deck-key-selected");
    expect(cell()).toHaveFocus();
  });

  it("is marked behind the dialog on narrow screens, for a new key and for one being edited", async () => {
    setWideScreen(false);
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    expect(screen.getByRole("dialog", { name: "Add key 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a key at position 2", hidden: true })).toHaveClass("deck-key-selected");
    await user.keyboard("{Escape}");

    fireEvent.contextMenu(screen.getByRole("button", { name: "Hello" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit key 1" })).toBeInTheDocument();
    expect(within(grid()).getByRole("button", { name: "Hello", hidden: true })).toHaveClass("deck-key-selected");
  });
});

describe("saving twice quickly", () => {
  it("sends one save from the key form while the first is still on its way", async () => {
    let finish: (saved: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const board = boards()[0]!;
    renderWithLanguage(<KeyEditorForm slot={0} existing={board.keys[0]} boardKind="voice" boards={[board]} obs={null} onSave={onSave} onTest={() => {}} />);
    const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
    // Two submits in the same tick: nothing has re-rendered in between, so a disabled button cannot be what stops the second.
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSave).toHaveBeenCalledTimes(1);
    finish(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.submit(form);
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("does not put the composer's text on a second key", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" });
    await user.type(screen.getByRole("textbox", { name: "Text to speak" }), "Thanks a lot");
    const save = screen.getByRole("button", { name: "Save as key" });
    await user.click(save);
    expect(await within(grid()).findByRole("button", { name: "Thanks a lot" })).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Already saved on key 2."));
    expect(within(grid()).getAllByRole("button", { name: "Thanks a lot" })).toHaveLength(1);
  });
});
