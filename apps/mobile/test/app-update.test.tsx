import type { AppUpdateState } from "@speed-deck/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey, writes } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const COMPUTER = "127.0.0.1";
const PHONE = "192.168.1.20";
const RELEASE = "https://github.com/alejox/speak-bot/releases/tag/v1.3.0";
const AUTO: AppUpdateState = { currentVersion: "1.2.0", mode: "auto", status: "up-to-date", lastCheckedAt: Date.UTC(2026, 10, 13, 15, 0), autoCheck: true };
const NOTIFY: AppUpdateState = { ...AUTO, mode: "notify" };
const GROUP = "About and updates";

async function openSettings(appUpdate: AppUpdateState | null | undefined, hostname = COMPUTER, language: "en" | "es" = "en") {
  const state = desktopState({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])], appUpdate });
  const remote = renderRemoteApp({ state, hostname, language });
  await screen.findByRole("button", { name: "Hi" });
  if (language === "es") await remote.user.click(screen.getByRole("link", { name: "Ajustes" }));
  else await goTo(remote.user, "Settings");
  await screen.findByRole("group", { name: language === "es" ? "Quitar anuncios" : "Remove ads" });
  return remote;
}

const group = () => screen.findByRole("group", { name: GROUP });
/** Nothing that acts on the computer: no button, link or checkbox. */
function expectReadOnly(element: HTMLElement) {
  expect(within(element).queryByRole("button")).not.toBeInTheDocument();
  expect(within(element).queryByRole("link")).not.toBeInTheDocument();
  expect(within(element).queryByRole("checkbox")).not.toBeInTheDocument();
}

describe("Settings → About and updates", () => {
  it("is the last group and shows the version, the state and a manual check on the computer", async () => {
    const { user, requests } = await openSettings(AUTO);
    const about = await group();
    const groups = screen.getAllByRole("group");
    expect(groups[groups.length - 1]).toBe(about);
    expect(about).toHaveTextContent("Speed Deck 1.2.0");
    expect(about).toHaveTextContent("You have the latest version.");
    expect(about).toHaveTextContent(/Last checked: .*2026/);
    expect(within(about).getByRole("checkbox", { name: "Check for updates automatically" })).toBeChecked();
    expect(within(about).queryByRole("button", { name: "Restart to update" })).not.toBeInTheDocument();
    expect(within(about).queryByRole("link")).not.toBeInTheDocument();

    await user.click(within(about).getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(writes(requests)).toContain("POST /api/app-update/check"));
  });

  it("shows a check in progress and its answer", async () => {
    const { emit } = await openSettings({ ...AUTO, status: "idle", lastCheckedAt: undefined });
    const about = await group();
    expect(about).toHaveTextContent("Speed Deck 1.2.0");
    expect(about).not.toHaveTextContent("Last checked");

    act(() => emit({ type: "app-update", update: { ...AUTO, status: "checking" } }));
    await waitFor(() => expect(within(about).getByRole("status")).toHaveTextContent("Checking for updates…"));
    expect(within(about).getByRole("button", { name: "Check for updates" })).toBeDisabled();

    act(() => emit({ type: "app-update", update: AUTO }));
    await waitFor(() => expect(within(about).getByRole("status")).toHaveTextContent("You have the latest version."));
    expect(within(about).getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("shows the download with a named progress bar, then offers the restart", async () => {
    const { user, requests, emit } = await openSettings({ ...AUTO, status: "downloading", latestVersion: "1.3.0", progressPercent: 40 });
    const about = await group();
    expect(about).toHaveTextContent("Downloading version 1.3.0…");
    const progress = within(about).getByRole("progressbar", { name: "Download of version 1.3.0" });
    expect(progress).toHaveAttribute("value", "40");
    expect(progress).toHaveAttribute("max", "100");
    expect(within(about).getByRole("button", { name: "Check for updates" })).toBeDisabled();
    expect(within(about).queryByRole("button", { name: "Restart to update" })).not.toBeInTheDocument();

    act(() => emit({ type: "app-update", update: { ...AUTO, status: "downloaded", latestVersion: "1.3.0" } }));
    const restart = await within(about).findByRole("button", { name: "Restart to update" });
    expect(about).toHaveTextContent("Version 1.3.0 is downloaded. It will be installed when you quit Speed Deck.");
    expect(within(about).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(about).queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();

    await user.click(restart);
    await waitFor(() => expect(writes(requests)).toContain("POST /api/app-update/install"));
  });

  it("offers the download page and explains updating by hand where the app cannot install updates", async () => {
    await openSettings({ ...NOTIFY, status: "available", latestVersion: "1.3.0", releaseUrl: RELEASE });
    const about = await group();
    expect(about).toHaveTextContent("Version 1.3.0 is available.");
    const link = within(about).getByRole("link", { name: "Download version 1.3.0" });
    expect(link).toHaveAttribute("href", RELEASE);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(about).toHaveTextContent("On this system updates are installed by hand: download the new version and install it over this one.");
    expect(within(about).queryByRole("button", { name: "Restart to update" })).not.toBeInTheDocument();
    expect(within(about).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(about).getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("never links anywhere but an https page", async () => {
    await openSettings({ ...NOTIFY, status: "available", latestVersion: "1.3.0", releaseUrl: "http://example.test/x" } as AppUpdateState);
    // The whole state is refused as malformed, so the group is not shown at all.
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download version/ })).not.toBeInTheDocument();
  });

  it("says quietly that it could not check, with the last check that worked", async () => {
    await openSettings({ ...AUTO, status: "error" });
    const about = await group();
    expect(within(about).getByRole("status")).toHaveTextContent("Could not check for updates.");
    expect(about).toHaveTextContent(/Last checked: .*2026/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(about).getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("keeps offering the announced version when a later check fails", async () => {
    await openSettings({ ...NOTIFY, status: "error", latestVersion: "1.3.0", releaseUrl: RELEASE });
    const about = await group();
    expect(about).toHaveTextContent("Could not check for updates.");
    expect(within(about).getByRole("link", { name: "Download version 1.3.0" })).toHaveAttribute("href", RELEASE);
  });

  it("turns the automatic checks off and on through the computer's settings", async () => {
    const { user, requests, emit } = await openSettings(AUTO);
    const about = await group();
    const checkbox = within(about).getByRole("checkbox", { name: "Check for updates automatically" });
    await user.click(checkbox);
    await waitFor(() => expect(requests.find((request) => request.method === "PUT" && request.url === "/api/settings")?.body).toEqual({ autoCheckUpdates: false }));

    act(() => emit({ type: "app-update", update: { ...AUTO, autoCheck: false } }));
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it("shows only the version in a build that never updates", async () => {
    await openSettings({ currentVersion: "0.0.0", mode: "disabled", status: "idle", autoCheck: true });
    const about = await group();
    expect(about).toHaveTextContent("Speed Deck 0.0.0");
    expect(within(about).queryByRole("status")).not.toBeInTheDocument();
    expectReadOnly(about);
  });

  it("is read-only on a paired phone: the computer's version and state, nothing to press", async () => {
    const { requests, emit } = await openSettings({ ...NOTIFY, status: "available", latestVersion: "1.3.0", releaseUrl: RELEASE }, PHONE);
    const about = await group();
    expect(about).toHaveTextContent("Speed Deck on the computer: version 1.2.0");
    expect(about).toHaveTextContent("Version 1.3.0 is available.");
    expectReadOnly(about);

    act(() => emit({ type: "app-update", update: { ...AUTO, status: "downloaded", latestVersion: "1.3.0" } }));
    await waitFor(() => expect(about).toHaveTextContent("Version 1.3.0 is downloaded on the computer. It will be installed when Speed Deck restarts there."));
    expectReadOnly(about);
    expect(writes(requests).filter((write) => write.includes("app-update"))).toEqual([]);
  });

  it("is not shown when the computer runs the server without the app, nor without a computer", async () => {
    await openSettings(null);
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
  });

  it("is not shown with a computer app too old to report its version", async () => {
    await openSettings(undefined);
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
  });

  it("is not shown in a browser without the computer app", async () => {
    const { user } = renderLocalApp({ boards: [boardOf("talk", "Talk", [speakKey(0, "Hi")])] });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Settings");
    await screen.findByRole("group", { name: "Remove ads" });
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
  });

  it("is in Spanish with the Spanish interface", async () => {
    await openSettings({ ...NOTIFY, status: "available", latestVersion: "1.3.0", releaseUrl: RELEASE }, COMPUTER, "es");
    const about = await screen.findByRole("group", { name: "Acerca de y actualizaciones" });
    expect(about).toHaveTextContent("La versión 1.3.0 está disponible.");
    expect(within(about).getByRole("button", { name: "Buscar actualizaciones" })).toBeInTheDocument();
    expect(within(about).getByRole("link", { name: "Descargar la versión 1.3.0" })).toBeInTheDocument();
    expect(within(about).getByRole("checkbox", { name: "Buscar actualizaciones automáticamente" })).toBeChecked();
    expect(about).toHaveTextContent("En este sistema las actualizaciones se instalan a mano: descarga la versión nueva e instálala sobre esta.");
  });
});
