import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopState, renderRemoteApp } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const withOutput = (voiceOutput: string | undefined, overlayConnected = false) => {
  const state = desktopState({ overlayConnected });
  if (voiceOutput !== undefined) state.settings = { ...state.settings, voiceOutput };
  return state;
};

const NO_OVERLAY = "OBS overlay not connected — speaking on speakers";

describe("Voice output setting", () => {
  it("chooses where the computer's voice is heard and explains the OBS setup", async () => {
    const { requests, user } = renderRemoteApp({ state: withOutput("speakers", true) });
    await goTo(user, "Settings");
    const output = await screen.findByRole("combobox", { name: "Voice output" });
    expect(output).toHaveValue("speakers");
    expect(within(output).getAllByRole("option").map((option) => option.textContent)).toEqual(["Speakers", "OBS", "Both"]);
    expect(screen.getByText(/open the Speed Deck Browser Source properties and enable 'Control audio via OBS'/)).toBeInTheDocument();

    await user.selectOptions(output, "obs");
    expect(requests).toContainEqual({ method: "PUT", url: "/api/settings", body: { voiceOutput: "obs" } });
    expect(output).toHaveValue("obs");
    expect(screen.queryByText(NO_OVERLAY)).not.toBeInTheDocument();
  });

  it("warns while no OBS overlay is connected, and clears the warning once one connects", async () => {
    const { user, emit } = renderRemoteApp({ state: withOutput("obs") });
    await goTo(user, "Settings");
    expect(await screen.findByText(NO_OVERLAY)).toBeInTheDocument();

    act(() => emit({ type: "overlay-audio", connected: true }));
    await waitFor(() => expect(screen.queryByText(NO_OVERLAY)).not.toBeInTheDocument());
  });

  it("never warns with the speakers chosen", async () => {
    const { user } = renderRemoteApp({ state: withOutput("speakers") });
    await goTo(user, "Settings");
    await screen.findByRole("combobox", { name: "Voice output" });
    expect(screen.queryByText(NO_OVERLAY)).not.toBeInTheDocument();
  });

  it("is hidden on a desktop that cannot send the voice to OBS", async () => {
    const { user } = renderRemoteApp({ state: withOutput(undefined) });
    await goTo(user, "Settings");
    await screen.findByRole("combobox", { name: "Speak on" });
    expect(screen.queryByRole("combobox", { name: "Voice output" })).not.toBeInTheDocument();
  });

  it("is hidden while speaking on this device", async () => {
    const { user } = renderRemoteApp({ state: withOutput("speakers") });
    await goTo(user, "Settings");
    await screen.findByRole("combobox", { name: "Voice output" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Speak on" }), "device");
    expect(screen.queryByRole("combobox", { name: "Voice output" })).not.toBeInTheDocument();
  });
});
