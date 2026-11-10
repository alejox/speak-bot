import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BoardKey } from "../src/components/BoardKey";

// Read from disk: Vitest turns CSS imports (even `?raw`) into empty strings.
const deckCss = readFileSync(resolve(__dirname, "../src/styles/deck.css"), "utf8");

const statusDot = (key: HTMLElement) => key.querySelector(".deck-key-dot");

describe("BoardKey on state", () => {
  it("marks a key that is on with a corner dot and keeps the state word for screen readers only", () => {
    render(<BoardKey label="Captions" role="command" pressed state="on" stateLabel="On" />);
    const key = screen.getByRole("button", { name: "Captions On" });
    expect(key).toHaveAttribute("aria-pressed", "true");
    expect(key).toHaveAttribute("data-state", "on");
    expect(statusDot(key)).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("On")).toHaveClass("visually-hidden");
  });

  it("gives live and recording keys the dot as well", () => {
    render(
      <>
        <BoardKey label="Stream" role="command" pressed state="live" stateLabel="LIVE" />
        <BoardKey label="Record" role="command" pressed state="recording" stateLabel="REC" />
      </>,
    );
    expect(statusDot(screen.getByRole("button", { name: "Stream LIVE" }))).not.toBeNull();
    expect(statusDot(screen.getByRole("button", { name: "Record REC" }))).not.toBeNull();
  });

  it("draws no dot while the toggle is off, nor on the current scene (it has a tick)", () => {
    render(
      <>
        <BoardKey label="Stream" role="command" pressed={false} />
        <BoardKey label="Main" role="command" pressed state="scene" />
      </>,
    );
    expect(statusDot(screen.getByRole("button", { name: "Stream" }))).toBeNull();
    expect(statusDot(screen.getByRole("button", { name: "Main" }))).toBeNull();
  });
});

describe("deck key styles", () => {
  it("draws no coloured ring or outlined badge for on, live or danger keys", () => {
    expect(deckCss).not.toMatch(/inset 0 0 0 3px/);
    expect(deckCss).not.toMatch(/--key-edge:\s*var\(--color-danger\)/);
    expect(deckCss).not.toMatch(/\.deck-key-state\s*\{/);
  });
});
