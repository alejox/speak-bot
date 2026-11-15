import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderDock, renderLocalApp, renderRemoteApp, speakKey, writes, type DesktopState } from "./app-fakes";
import { FakeSocket } from "./desktop-fakes";

const COPY = "/Users/ana/Library/Application Support/speed-deck/boards.json.corrupt-2026-11-14T10-00-00.000Z";
const RESTORED = { file: "boards", outcome: "restored", at: Date.UTC(2026, 10, 14, 10, 0), damagedCopyPath: COPY } as const;
const state = (overrides: Partial<DesktopState> = {}) => desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])], ...overrides });
const notice = () => screen.queryByTestId("data-recovery-notice");

describe("telling the person that the boards file was damaged", () => {
  it("says on the computer that the last saved copy was restored and where the damaged file is, until dismissed", async () => {
    const desktop = state({ dataRecovery: RESTORED });
    const { user, requests } = renderRemoteApp({ state: desktop, hostname: "127.0.0.1" });
    await screen.findByRole("button", { name: "Hi" });

    const shown = await screen.findByTestId("data-recovery-notice");
    expect(shown).toHaveAttribute("role", "alert");
    expect(shown).toHaveTextContent("Your boards file was damaged. Speed Deck restored the last saved copy");
    expect(shown).toHaveTextContent("your most recent change may be missing");
    expect(shown).toHaveTextContent(`The damaged file was kept at ${COPY}.`);

    await user.click(within(shown).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByTestId("data-recovery-notice")).not.toBeInTheDocument());
    // The computer remembers it: every window, and the next start, stay quiet.
    expect(writes(requests)).toContain("POST /api/data-recovery/dismiss");
    expect(desktop.dataRecovery).toBeNull();
  });

  it("says when the default boards had to be used", async () => {
    renderRemoteApp({ state: state({ dataRecovery: { ...RESTORED, outcome: "defaults" } }), hostname: "127.0.0.1" });
    const shown = await screen.findByTestId("data-recovery-notice");
    expect(shown).toHaveTextContent(`Your boards file was damaged. Speed Deck started with the default boards. The damaged file was kept at ${COPY}.`);
  });

  it("reads in Spanish", async () => {
    renderRemoteApp({ state: state({ dataRecovery: RESTORED }), hostname: "127.0.0.1", language: "es" });
    const shown = await screen.findByTestId("data-recovery-notice");
    expect(shown).toHaveTextContent("Tu archivo de tableros estaba dañado. Speed Deck restauró la última copia guardada");
    expect(shown).toHaveTextContent(`El archivo dañado se conservó en ${COPY}.`);
    expect(within(shown).getByRole("button", { name: "Cerrar aviso" })).toBeInTheDocument();
  });

  it("reads Spanish for the default boards too", async () => {
    renderRemoteApp({ state: state({ dataRecovery: { ...RESTORED, outcome: "defaults" } }), hostname: "127.0.0.1", language: "es" });
    expect(await screen.findByTestId("data-recovery-notice")).toHaveTextContent(
      `Tu archivo de tableros estaba dañado. Speed Deck empezó con los tableros predeterminados. El archivo dañado se conservó en ${COPY}.`,
    );
  });

  it("appears when a recovery happens while the window is open, and goes when another window dismisses it", async () => {
    const desktop = state();
    const { emit } = renderRemoteApp({ state: desktop, hostname: "127.0.0.1" });
    await screen.findByRole("button", { name: "Hi" });
    expect(notice()).toBeNull();

    desktop.dataRecovery = RESTORED;
    act(() => emit({ type: "data-recovery" }));
    expect(await screen.findByTestId("data-recovery-notice")).toBeInTheDocument();

    desktop.dataRecovery = null;
    act(() => emit({ type: "data-recovery" }));
    await waitFor(() => expect(screen.queryByTestId("data-recovery-notice")).not.toBeInTheDocument());
  });

  it("is read again when the link to the computer reopens", async () => {
    const desktop = state();
    renderRemoteApp({ state: desktop, hostname: "127.0.0.1" });
    await screen.findByRole("button", { name: "Hi" });
    desktop.dataRecovery = RESTORED;
    act(() => FakeSocket.instances.at(-1)!.open());
    expect(await screen.findByTestId("data-recovery-notice")).toBeInTheDocument();
  });

  it("is not shown on a paired phone, in the OBS dock or without a computer", async () => {
    const paired = renderRemoteApp({ state: state({ dataRecovery: RESTORED }) });
    await screen.findByRole("button", { name: "Hi" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("data-recovery-notice")).not.toBeInTheDocument();
    paired.view.unmount();

    const dock = renderDock({ state: state({ dataRecovery: RESTORED }), hostname: "127.0.0.1" });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByTestId("data-recovery-notice")).not.toBeInTheDocument();
    dock.view.unmount();

    renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    expect(screen.queryByTestId("data-recovery-notice")).not.toBeInTheDocument();
  });
});
