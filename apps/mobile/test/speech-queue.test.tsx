import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";

const boards = () => [boardOf("main", "Main", [speakKey(0, "Hello"), { slot: 1, action: { type: "voice.repeat" } }, { slot: 2, action: { type: "voice.stop" } }])];
const field = () => screen.getByRole("textbox", { name: "Text to speak" });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const speakButton = () => screen.getByRole("button", { name: "Speak" });

describe("typed text waits its turn; everything else interrupts", () => {
  it("queues what the composer says and interrupts from keys, quick phrases, recent phrases and repeat", async () => {
    const { synthesizer } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hello" });
    const modes = () => synthesizer.spoken.map((entry) => `${entry.text}: ${entry.options?.mode ?? "interrupt"}`);

    type("Typed");
    fireEvent.click(speakButton());
    type("Entered");
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Hello" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Quick phrases" })).getByRole("button", { name: "Yes" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Recent phrases" })).getByRole("button", { name: "Typed" }));
    fireEvent.click(screen.getByRole("button", { name: "Repeat" }));
    expect(modes()).toEqual(["Typed: queue", "Entered: queue", "Hello: interrupt", "Yes: interrupt", "Typed: interrupt", "Typed: interrupt"]);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(synthesizer.cancelled).toBeGreaterThan(0);
  });

  it("sends the mode to the computer for typed text only", async () => {
    const { requests } = renderRemoteApp({ state: desktopState({ boards: boards() }) });
    await screen.findByRole("button", { name: "Hello" });
    type("Typed");
    fireEvent.click(speakButton());
    await waitFor(() => expect(requests.some((request) => request.url === "/api/speak")).toBe(true));
    expect(requests.find((request) => request.url === "/api/speak")!.body).toMatchObject({ text: "Typed", mode: "queue" });
    fireEvent.click(screen.getByRole("button", { name: "Hello" }));
    expect(requests).toContainEqual({ method: "POST", url: "/api/actions/execute", body: { action: { type: "voice.speak", text: "Hello" } } });
  });

  it("says so when too many phrases already wait", async () => {
    const state = desktopState({ boards: boards() });
    state.speak = { status: 409, body: { error: "Full.", code: "queue-full" } };
    renderRemoteApp({ state });
    await screen.findByRole("button", { name: "Hello" });
    type("One too many");
    fireEvent.click(speakButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Too many phrases are waiting. Wait for one to be spoken."));
  });
});
