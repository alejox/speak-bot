import type { Key } from "@speed-deck/core";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { translate } from "../src/i18n/messages";
import { boardOf, desktopState, renderRemoteApp, setWideScreen, speakKey } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const OBS_LINK = /^OBS/;
const streamKey: Key = { slot: 0, action: { type: "obs.toggleStream" } };
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", [streamKey], "deck")];

/** A computer whose OBS connection was never turned on (the default after installing). */
function obsOff() {
  const state = desktopState({ boards: boards() });
  state.settings = { ...state.settings, obs: { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: false } };
  state.obs = { ...state.obs, enabled: false, status: "disconnected" };
  return state;
}

describe("Save and connect", () => {
  it("turns the connection on and connects while the checkbox is still unticked", async () => {
    const { requests, user } = renderRemoteApp({ state: obsOff(), hostname: "127.0.0.1" });
    await goTo(user, OBS_LINK);
    const group = await screen.findByRole("region", { name: "Connection" });
    expect(within(group).getByRole("checkbox", { name: "Connect to OBS" })).not.toBeChecked();
    expect(within(group).getByRole("status")).toHaveTextContent("OBS: Turned off");

    await user.click(within(group).getByRole("button", { name: "Save and connect" }));

    await waitFor(() => expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { obs: { enabled: true, host: "127.0.0.1", port: 4455 } } }));
    await waitFor(() => expect(within(group).getByRole("checkbox", { name: "Connect to OBS" })).toBeChecked());
    expect(within(group).getByRole("status")).not.toHaveTextContent("OBS: Turned off");
  });

  it("leaves turning the connection off to the checkbox, which does it at once", async () => {
    const { requests, user } = renderRemoteApp({ hostname: "127.0.0.1" });
    await goTo(user, OBS_LINK);
    const group = await screen.findByRole("region", { name: "Connection" });
    const checkbox = within(group).getByRole("checkbox", { name: "Connect to OBS" });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    await waitFor(() => expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { obs: { enabled: false } } }));
    await waitFor(() => expect(within(group).getByRole("status")).toHaveTextContent("OBS: Turned off"));
    expect(within(group).getByRole("checkbox", { name: "Connect to OBS" })).not.toBeChecked();
  });
});

describe("a Deck key while OBS control is off", () => {
  // A window with the sidebar, where each Deck board is a menu item.
  beforeEach(() => setWideScreen(true));
  afterEach(() => setWideScreen(false));

  it("says where to turn it on: the OBS section, not Settings", async () => {
    const { user } = renderRemoteApp({ state: obsOff(), hostname: "localhost" });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Stream");
    const key = await screen.findByRole("button", { name: /^Stream/ });
    await waitFor(() => expect(key).toHaveAccessibleDescription("The OBS connection is turned off. Turn it on in the OBS section of the computer app."));
    expect(key).toHaveAttribute("title", "The OBS connection is turned off. Turn it on in the OBS section of the computer app.");
  });

  it("says so in Spanish too", () => {
    expect(translate("es", "key.obsDisabled")).toBe("La conexión con OBS está desactivada. Actívala en la sección OBS de la app de la computadora.");
    expect(translate("es", "key.obsDisabled")).not.toMatch(/Ajustes/);
  });

  it("leads from the Deck's status indicator to the OBS section", async () => {
    const { user } = renderRemoteApp({ state: obsOff(), hostname: "localhost" });
    await screen.findByRole("button", { name: "Hi" }, { timeout: 5000 });
    await goTo(user, "Stream");
    await user.click(await screen.findByRole("button", { name: "OBS turned off. Open OBS" }));
    expect(screen.getByRole("heading", { level: 2, name: "OBS" })).toBeInTheDocument();
  });
});
