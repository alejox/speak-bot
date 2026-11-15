import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { boardOf, renderLocalApp, setScreen, setWideScreen, speakKey } from "./app-fakes";

const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")])];
const composer = () => screen.getByRole("region", { name: "Type to speak" });

describe("where the Voice composer sits on wide windows", () => {
  afterEach(() => setWideScreen(false));

  it("stacks above the keys below 1200px, so the phrase grid gets the whole width", async () => {
    setScreen({ width: 1024, height: 768, finePointer: true });
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByRole("complementary", { name: "Type to speak" })).not.toBeInTheDocument();
    expect(composer().closest("main")).not.toBeNull();
    expect(document.querySelector(".app")).not.toHaveClass("app-inspecting");
    // Still the wide workspace: the grid keeps filling its area with the board's columns and rows.
    expect(screen.getByRole("list", { name: /^Keys of/ })).toHaveAttribute("data-layout", "fill");
    // Above the keys: it comes first in the page.
    expect(composer().compareDocumentPosition(screen.getByRole("button", { name: "Hi" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps its side column from 1200px up", async () => {
    setScreen({ width: 1200, height: 800, finePointer: true });
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.getByRole("complementary", { name: "Type to speak" })).toContainElement(composer());
    expect(document.querySelector(".app")).toHaveClass("app-inspecting");
  });

  it("waits behind Write, like on a phone, in a window that is wide but too short to stack it", async () => {
    setScreen({ width: 1100, height: 500, finePointer: true });
    renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByRole("region", { name: "Type to speak" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write" })).toBeInTheDocument();
  });
});
