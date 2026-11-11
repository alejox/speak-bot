import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopState, renderLocalApp, renderRemoteApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const obsGroup = () => screen.getByRole("region", { name: "Connection" });
const OBS_LINK = /^OBS/;

describe("OBS settings", () => {
  it("saves the connection on the computer itself, sending the password only when typed", async () => {
    const { requests, user } = renderRemoteApp({ hostname: "127.0.0.1" });
    await goTo(user, OBS_LINK);
    const group = await screen.findByRole("region", { name: "Connection" });
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
    await goTo(user, OBS_LINK);
    const group = await screen.findByRole("region", { name: "Connection" });
    await user.click(within(group).getByRole("button", { name: "Test connection" }));
    expect(requests).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/obs/connect" }));
    act(() => emit({ type: "obs-status", status: "auth-failed" }));
    expect(within(group).getByRole("status")).toHaveTextContent("OBS: Wrong password");
  });

  it("has no section on a paired phone", async () => {
    renderRemoteApp({ hostname: "192.168.1.20" });
    await screen.findByRole("link", { name: "Voice" });
    expect(screen.queryByRole("link", { name: OBS_LINK })).not.toBeInTheDocument();
  });

  it("shows when the connection is turned off", async () => {
    const state = desktopState();
    state.settings = { ...state.settings, obs: { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: true } };
    const { user } = renderRemoteApp({ state, hostname: "127.0.0.1" });
    await goTo(user, OBS_LINK);
    const group = await screen.findByRole("region", { name: "Connection" });
    expect(within(group).getByRole("status")).toHaveTextContent("OBS: Turned off");
    expect(within(group).getByLabelText("Password")).toHaveAccessibleDescription("Saved. Type a new one to change it.");
  });

  it("has no section in phone-only mode", async () => {
    renderLocalApp();
    await screen.findByRole("link", { name: "Voice" });
    expect(screen.queryByRole("link", { name: OBS_LINK })).not.toBeInTheDocument();
  });

  it("is no longer part of Settings", async () => {
    const { user } = renderRemoteApp({ hostname: "127.0.0.1" });
    await goTo(user, "Settings");
    await screen.findByRole("combobox", { name: "Speak on" });
    expect(screen.queryByRole("region", { name: "Connection" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Deck" })).not.toBeInTheDocument();
  });
});

describe("OBS navigation item", () => {
  const obsLink = () => within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: OBS_LINK });

  it("says and shows whether OBS is connected", async () => {
    const { emit } = renderRemoteApp({ hostname: "127.0.0.1" });
    await waitFor(() => expect(obsLink()).toHaveAccessibleName("OBS, connected"));
    expect(obsLink()).toHaveClass("side-nav-link-ok");
    expect(obsLink().querySelector(".nav-status-ok")).not.toBeNull();

    act(() => emit({ type: "obs-status", status: "connecting" }));
    expect(obsLink()).toHaveAccessibleName("OBS, connecting");
    expect(obsLink()).toHaveClass("side-nav-link-pending");

    act(() => emit({ type: "obs-status", status: "error" }));
    expect(obsLink()).toHaveAccessibleName("OBS, not connected");
    expect(obsLink()).toHaveClass("side-nav-link-off");
    expect(obsLink().querySelector(".nav-status-off")).not.toBeNull();
  });

  it("says the status in Spanish", async () => {
    renderRemoteApp({ hostname: "127.0.0.1", language: "es" });
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Deck", "Voz", "OBS, sin conexión", "Ajustes"]);
    await waitFor(() => expect(within(nav).getByRole("link", { name: OBS_LINK })).toHaveAccessibleName("OBS, conectado"));
  });

  it("is not connected while OBS is turned off", async () => {
    const state = desktopState();
    state.settings = { ...state.settings, obs: { enabled: false, host: "127.0.0.1", port: 4455, hasPassword: false } };
    state.obs = { ...state.obs, enabled: false };
    renderRemoteApp({ state, hostname: "127.0.0.1" });
    await screen.findByRole("link", { name: "Voice" });
    expect(obsLink()).toHaveAccessibleName("OBS, not connected");
  });
});
