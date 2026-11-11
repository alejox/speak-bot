import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boardOf, renderLocalApp, setWideScreen, speakKey } from "./app-fakes";

const boards = () => [boardOf("main", "Main", [speakKey(0, "Hello")])];
const composerPanel = () => screen.getByRole("complementary", { name: "Type to speak" });

describe("Voice workspace on wide screens", () => {
  beforeEach(() => setWideScreen(true));
  afterEach(() => setWideScreen(false));

  it("keeps the workspace to the keys and puts the composer in the side panel", async () => {
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" });
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toHaveClass("visually-hidden");
    const status = screen.getAllByRole("status").find((element) => element.classList.contains("status"));
    expect(status).toHaveClass("visually-hidden");

    const panel = composerPanel();
    expect(screen.getByRole("main")).not.toContainElement(panel);
    expect(within(panel).getByLabelText("Text to speak")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Speak" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Save as key" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByLabelText("Text to speak")).not.toBeInTheDocument();
  });

  it("speaks from the panel and lists the recent phrases under the composer", async () => {
    const { user, synthesizer } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" });
    const panel = composerPanel();
    await user.type(within(panel).getByLabelText("Text to speak"), "Good morning");
    await user.click(within(panel).getByRole("button", { name: "Speak" }));
    expect(synthesizer.texts).toEqual(["Good morning"]);
    expect(within(panel).getByRole("region", { name: "Recent phrases" })).toHaveTextContent("Good morning");
  });

  it("shows the key inspector in the panel while editing, and the composer again once it closes", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Hello" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const inspector = screen.getByRole("complementary", { name: "Key 1" });
    expect(screen.queryByRole("complementary", { name: "Type to speak" })).not.toBeInTheDocument();
    await user.click(within(inspector).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(composerPanel()).toBeInTheDocument());
    expect(screen.queryByRole("complementary", { name: "Key 1" })).not.toBeInTheDocument();
  });
});

describe("Voice workspace on narrow screens", () => {
  it("keeps the composer above the keys, with no side panel", async () => {
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" });
    expect(screen.getByRole("heading", { level: 2, name: "Voice" })).toHaveClass("visually-hidden");
    expect(within(screen.getByRole("main")).getByLabelText("Text to speak")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
