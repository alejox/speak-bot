import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopState, renderLocalApp, renderRemoteApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const obsGroup = () => screen.getByRole("region", { name: "OBS" });

describe("OBS settings", () => {
  it("saves the connection on the computer itself, sending the password only when typed", async () => {
    const { requests, user } = renderRemoteApp({ hostname: "127.0.0.1" });
    await goTo(user, "Settings");
    const group = await screen.findByRole("region", { name: "OBS" });
    expect(within(group).getByRole("status")).toHaveTextContent("OBS: Connected");
    expect(within(group).getByLabelText("Password")).toHaveAccessibleDescription("Leave empty if the OBS server has no password.");

    const port = within(group).getByRole("spinbutton", { name: "Port" });
    await user.clear(port);
    await user.type(port, "70000");
    await user.click(within(group).getByRole("button", { name: "Save and connect" }));
    expect(within(group).getByRole("alert")).toHaveTextContent("The port must be a whole number from 1 to 65535.");

    await user.clear(port);
    await user.type(port, "4456");
    await user.click(within(group).getByRole("button", { name: "Save and connect" }));
    await waitFor(() =>
      expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { obs: { enabled: true, host: "127.0.0.1", port: 4456 } } }),
    );

    await user.type(within(group).getByLabelText("Password"), "secret");
    await user.click(within(group).getByRole("button", { name: "Save and connect" }));
    await waitFor(() => expect(within(obsGroup()).getByLabelText("Password")).toHaveValue(""));
    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { obs: { enabled: true, host: "127.0.0.1", port: 4456, password: "secret" } } });
    expect(within(obsGroup()).getByLabelText("Password")).toHaveAccessibleDescription("Saved. Type a new one to change it.");
    expect(screen.getAllByText("OBS settings saved.").length).toBeGreaterThan(0);
  });

  it("tests the connection and shows live status changes", async () => {
    const { emit, requests, user } = renderRemoteApp({ hostname: "127.0.0.1" });
    await goTo(user, "Settings");
    const group = await screen.findByRole("region", { name: "OBS" });
    await user.click(within(group).getByRole("button", { name: "Test connection" }));
    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/obs/connect" }));
    act(() => emit({ type: "obs-status", status: "auth-failed" }));
    expect(within(group).getByRole("status")).toHaveTextContent("OBS: Wrong password");
  });

  it("is read-only on a phone, explaining that it changes on the computer", async () => {
    const { user } = renderRemoteApp({ hostname: "192.168.1.20" });
    await goTo(user, "Settings");
    const group = await screen.findByRole("region", { name: "OBS" });
    expect(within(group).getByText("The OBS connection can only be changed on the computer running Speed Deck.")).toBeInTheDocument();
    expect(within(group).getByRole("checkbox", { name: "Connect to OBS" })).toBeDisabled();
    expect(within(group).getByRole("button", { name: "Save and connect" })).toBeDisabled();
  });

  it("shows when the connection is turned off", async () => {
    const state = desktopState();
    state.settings = { ...state.settings, obs: { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: true } };
    const { user } = renderRemoteApp({ state, hostname: "127.0.0.1" });
    await goTo(user, "Settings");
    const group = await screen.findByRole("region", { name: "OBS" });
    expect(within(group).getByRole("status")).toHaveTextContent("OBS: Turned off");
    expect(within(group).getByLabelText("Password")).toHaveAccessibleDescription("Saved. Type a new one to change it.");
  });

  it("is not offered in phone-only mode", async () => {
    const { user } = renderLocalApp();
    await goTo(user, "Settings");
    expect(screen.queryByRole("region", { name: "OBS" })).not.toBeInTheDocument();
  });
});
