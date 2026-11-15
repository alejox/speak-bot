import type { AppUpdateState } from "@speed-deck/core";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const UPDATE: AppUpdateState = { currentVersion: "1.2.0", mode: "auto", status: "up-to-date", autoCheck: true };
const NOTICES = "THIRD-PARTY NOTICES\n\nreact 19.3.1\nLicence: MIT\n\nMIT License\nCopyright (c) Meta Platforms";

/** Answers the notices file the build ships next to the app, and records what was asked for. */
function serveNotices(answer: () => Response | Promise<Response>) {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return answer();
  });
  return requested;
}

describe("Settings → Open-source licences", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is in About and updates on the computer and opens the shipped notices inside the app", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])], appUpdate: UPDATE }), hostname: "127.0.0.1" });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Settings");
    const about = await screen.findByRole("group", { name: "About and updates" });
    const link = within(about).getByRole("link", { name: "Open-source licences" });
    expect(link).toHaveAttribute("href", "/THIRD-PARTY-NOTICES.txt");

    const requested = serveNotices(() => new Response(NOTICES));
    await user.click(link);

    const dialog = await screen.findByRole("dialog", { name: "Open-source licences" });
    expect(await within(dialog).findByText(/Copyright \(c\) Meta Platforms/)).toBeInTheDocument();
    expect(requested).toEqual(["/THIRD-PARTY-NOTICES.txt"]);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Open-source licences" })).not.toBeInTheDocument();
  });

  it("is offered on a phone without a computer too, in its own About group", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Settings");
    const about = await screen.findByRole("group", { name: "About" });
    expect(within(about).getByRole("link", { name: "Open-source licences" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "About and updates" })).not.toBeInTheDocument();
  });

  it("says so when the notices cannot be loaded", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Settings");
    serveNotices(() => new Response("nope", { status: 404 }));
    await user.click(screen.getByRole("link", { name: "Open-source licences" }));
    const dialog = await screen.findByRole("dialog", { name: "Open-source licences" });
    expect(await within(dialog).findByText("Could not load the licences. Check the connection and try again.")).toBeInTheDocument();
  });

  it("reads in Spanish", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hola")])], language: "es" });
    await screen.findByRole("button", { name: "Hola" });
    await user.click(screen.getByRole("link", { name: "Ajustes" }));
    const about = await screen.findByRole("group", { name: "Acerca de" });
    expect(within(about).getByRole("link", { name: "Licencias de código abierto" })).toBeInTheDocument();
  });
});
