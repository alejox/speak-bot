import type { Board, Key } from "@speed-deck/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const RESOLVE = "/Applications/DaVinci Resolve/DaVinci Resolve.app";
const PHOTOSHOP = "/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app";
const APPS = [
  { id: RESOLVE, name: "DaVinci Resolve" },
  { id: "/Applications/Safari.app", name: "Safari" },
  { id: PHOTOSHOP, name: "Adobe Photoshop 2025" },
];
const openKey: Key = { slot: 0, action: { type: "system.openApp", appId: RESOLVE } };
const boards = (deckKeys: Key[] = []): Board[] => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", deckKeys, "deck")];
const grid = () => screen.getByRole("list", { name: /^Keys of/ });

async function openDeck(options: { applications?: typeof APPS | null; deckKeys?: Key[] } = {}) {
  const state = desktopState({ boards: boards(options.deckKeys) });
  state.applications = options.applications === undefined ? APPS : options.applications;
  const rendered = renderRemoteApp({ state });
  await screen.findByRole("button", { name: "Hi" });
  await goTo(rendered.user, "Deck");
  await screen.findByRole("button", { name: "Board: Stream" });
  return { ...rendered, state };
}

async function addOpenApplicationKey(user: { click: (element: Element) => Promise<void> }) {
  await user.click(screen.getByRole("button", { name: "Add a key at position 1" }));
  await user.click(within(screen.getByRole("dialog", { name: "Add key 1" })).getByRole("button", { name: /^Open application/ }));
  return screen.getByRole("dialog", { name: "Add key 1" });
}

describe("the open application action", () => {
  it("is offered on Deck boards under Computer, with the computer's applications sorted by name", async () => {
    const { user } = await openDeck();
    await user.click(screen.getByRole("button", { name: "Add a key at position 1" }));
    expect(within(screen.getByRole("dialog")).getAllByRole("region").map((group) => group.getAttribute("aria-label"))).toEqual(["Navigation", "OBS", "Computer"]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Open application/ }));
    const select = await within(screen.getByRole("dialog")).findByRole("combobox", { name: "Application" });
    await waitFor(() => expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose…", "Adobe Photoshop 2025", "DaVinci Resolve", "Safari"]));
  });

  it("saves the chosen application, names the key after it and opens it through the computer", async () => {
    const { user, requests } = await openDeck();
    const dialog = await addOpenApplicationKey(user);
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: "Application" }), await within(dialog).findByRole("option", { name: "DaVinci Resolve" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const key = await within(grid()).findByRole("button", { name: "DaVinci Resolve" });
    expect(requests.find((request) => request.method === "PUT" && request.url === "/api/boards/stream/keys/0")!.body).toMatchObject({
      action: { type: "system.openApp", appId: RESOLVE },
    });

    await user.click(key);
    await waitFor(() => expect(requests).toContainEqual({ method: "POST", url: "/api/actions/execute", body: { action: { type: "system.openApp", appId: RESOLVE } } }));
  });

  it("is not offered on Voice boards", async () => {
    const { user } = renderRemoteApp({ state: desktopState({ boards: boards() }) });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(screen.getByRole("button", { name: "Add a key at position 2" }));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /^Open application/ })).not.toBeInTheDocument();
  });

  it("says so when the computer has no applications to offer", async () => {
    const { user } = await openDeck({ applications: [] });
    const dialog = await addOpenApplicationKey(user);
    expect(await within(dialog).findByText("No applications were found on the computer.")).toBeInTheDocument();
    expect(within(within(dialog).getByRole("combobox", { name: "Application" })).getAllByRole("option")).toHaveLength(1);
  });

  it("says so when the computer cannot list its applications", async () => {
    const { user } = await openDeck({ applications: null });
    const dialog = await addOpenApplicationKey(user);
    expect(await within(dialog).findByText("The computer's applications could not be listed.")).toBeInTheDocument();
  });

  it("keeps a saved application that is no longer listed selectable, under its name", async () => {
    const { user } = await openDeck({ applications: [APPS[1]!], deckKeys: [openKey] });
    fireEvent.contextMenu(await within(grid()).findByRole("button", { name: "DaVinci Resolve" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const select = await within(screen.getByRole("dialog")).findByRole("combobox", { name: "Application" });
    await waitFor(() => expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose…", "DaVinci Resolve", "Safari"]));
    expect(select).toHaveValue(RESOLVE);
  });

  it("explains a key whose application the computer no longer has", async () => {
    const { user, state } = await openDeck({ deckKeys: [openKey] });
    state.execute["system.openApp"] = { status: 404, body: { error: "Not listed.", code: "app-not-found" } };
    await user.click(await within(grid()).findByRole("button", { name: "DaVinci Resolve" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((status) => status.textContent === "That application is not on the computer any more.")).toBe(true));
  });

  it("needs the computer in phone-only mode", async () => {
    const { user } = renderLocalApp({ boards: boards([openKey]) });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    const key = await within(grid()).findByRole("button", { name: "DaVinci Resolve" });
    expect(key).toHaveAttribute("aria-disabled", "true");
    expect(key).toHaveAccessibleDescription("Needs the computer app.");
  });
});
