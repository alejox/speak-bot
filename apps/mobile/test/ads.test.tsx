import type { Key } from "@speed-deck/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardOf, desktopState, renderLocalApp, renderRemoteApp, speakKey, writes } from "./app-fakes";
import { goTo } from "./i18n-helpers";

const deckKeys: Key[] = [{ slot: 0, action: { type: "obs.toggleStream" } }];
const boards = () => [boardOf("talk", "Talk", [speakKey(0, "Hi")]), boardOf("stream", "Stream", deckKeys, "deck")];
const SPONSOR = { id: "s1", title: "Stream gear", text: "10% off mics", linkUrl: "https://sponsor.example/offer", imagePath: "/api/ad/image?v=s1", alt: "A microphone" };
const banner = () => screen.queryByRole("region", { name: "Advertisement" });

async function openRemoteDeck(options: Parameters<typeof desktopState>[0] = {}, hostname = "127.0.0.1") {
  const state = desktopState({ boards: boards(), ...options });
  const remote = renderRemoteApp({ state, hostname });
  await screen.findByRole("button", { name: "Hi" });
  await goTo(remote.user, "Deck");
  await screen.findByRole("button", { name: /^Stream/ });
  return remote;
}

const PIXEL_GRANT = [{ deviceId: "device-pixel-0001", deviceName: "Pixel 8" }];
/** Nothing that sells or activates anything outside the Android app: no price, link, key field or button. */
function expectNoPurchaseHere(group: HTMLElement) {
  expect(within(group).queryByRole("link")).not.toBeInTheDocument();
  expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(group).queryByRole("button")).not.toBeInTheDocument();
  expect(group).not.toHaveTextContent(/USD|\$|licen[sc]e|\bkey\b/i);
}

describe("ad banner", () => {
  it("shows the house banner on the Deck, never on Voice, and leads to Settings → Remove ads", async () => {
    const { user } = await openRemoteDeck();
    const ad = await screen.findByRole("region", { name: "Advertisement" });
    expect(within(ad).getByText("Ad")).toBeInTheDocument();
    // No price is promised here: the store shows its own where the purchase is made.
    expect(ad).not.toHaveTextContent(/USD|\$|\d/);
    await user.click(within(ad).getByRole("button", { name: "Remove ads" }));
    expect(screen.getByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Remove ads" })).toHaveFocus();

    await goTo(user, "Voice");
    await screen.findByRole("button", { name: "Hi" });
    expect(banner()).not.toBeInTheDocument();
  });

  it("shows the sponsor from the computer, opening its link outside the app", async () => {
    await openRemoteDeck({ ad: SPONSOR });
    const link = await within(await screen.findByRole("region", { name: "Advertisement" })).findByRole("link", { name: /Stream gear/ });
    expect(link).toHaveAttribute("href", "https://sponsor.example/offer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(link).getByRole("img", { name: "A microphone" })).toHaveAttribute("src", "/api/ad/image?v=s1");
    expect(link).toHaveTextContent("10% off mics");
  });

  it("is hidden while a phone's purchase removes the computer's ads, and follows changes at once", async () => {
    const { emit } = await openRemoteDeck({ adsGrants: PIXEL_GRANT }, "192.168.1.20");
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(banner()).not.toBeInTheDocument();

    act(() => emit({ type: "ads-changed", ads: { adsFree: false } }));
    expect(await screen.findByRole("region", { name: "Advertisement" })).toBeInTheDocument();

    act(() => emit({ type: "ads-changed", ads: { adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 2 } } }));
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it("shows the house banner in a phone's browser without the computer, pointing to the Android app", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    const ad = await screen.findByRole("region", { name: "Advertisement" });
    await user.click(within(ad).getByRole("button", { name: "Remove ads" }));
    const group = screen.getByRole("group", { name: "Remove ads" });
    expect(group).toHaveTextContent("Removing ads is done in the Speed Deck app for Android.");
    expectNoPurchaseHere(group);
  });

  it("is in Spanish with the Spanish interface", async () => {
    const state = desktopState({ boards: boards() });
    const { user } = renderRemoteApp({ state, language: "es" });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(within(screen.getByRole("navigation", { name: "Secciones" })).getAllByRole("link")[0]!);
    const ad = await screen.findByRole("region", { name: "Publicidad" });
    expect(within(ad).getByText("Anuncio")).toBeInTheDocument();
    expect(within(ad).getByRole("button", { name: "Quita los anuncios" })).toBeInTheDocument();
  });
});

describe("Settings → Remove ads", () => {
  async function openSettings(options: Parameters<typeof desktopState>[0] = {}, hostname = "127.0.0.1", language: "en" | "es" = "en") {
    const state = desktopState({ boards: boards(), ...options });
    const remote = renderRemoteApp({ state, hostname, language });
    await screen.findByRole("button", { name: "Hi" });
    if (language === "es") await remote.user.click(screen.getByRole("link", { name: "Ajustes" }));
    else await goTo(remote.user, "Settings");
    const group = await screen.findByRole("group", { name: language === "es" ? "Quitar anuncios" : "Remove ads" });
    return { ...remote, group };
  }

  it("explains on the computer that ads are removed by buying in the Android app, selling nothing here", async () => {
    const { group, requests } = await openSettings();
    expect(group).toHaveTextContent("Ads are shown.");
    expect(group).toHaveTextContent("To remove them, buy “Remove ads” in the Speed Deck app for Android while it is connected to this computer. They go away here and on that phone.");
    expectNoPurchaseHere(group);
    expect(writes(requests)).not.toContain("POST /api/ads/report");
  });

  it("names on the computer the phone whose purchase removed the ads, and follows a refund", async () => {
    const { group, emit } = await openSettings({ adsGrants: PIXEL_GRANT });
    await waitFor(() => expect(group).toHaveTextContent("Ads are removed, thanks to the purchase made on Pixel 8."));
    expect(group).not.toHaveTextContent("To remove them");
    expectNoPurchaseHere(group);

    act(() => emit({ type: "ads-changed", ads: { adsFree: false } }));
    await waitFor(() => expect(group).toHaveTextContent("Ads are shown."));
    expect(group).toHaveTextContent("To remove them, buy");
  });

  it("shows the status in a phone's browser paired with the computer, pointing to the Android app", async () => {
    const { group, requests, emit } = await openSettings({}, "192.168.1.20");
    expect(group).toHaveTextContent("Ads are shown.");
    expect(group).toHaveTextContent("Removing ads is done in the Speed Deck app for Android.");
    expectNoPurchaseHere(group);

    act(() => emit({ type: "ads-changed", ads: { adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 2 } } }));
    await waitFor(() => expect(group).toHaveTextContent("Ads are removed, thanks to the purchase made on Pixel 8."));
    // A browser has no store purchase to report.
    expect(writes(requests)).not.toContain("POST /api/ads/report");
  });

  it("is in Spanish with the Spanish interface", async () => {
    const { group, emit } = await openSettings({}, "127.0.0.1", "es");
    expect(group).toHaveTextContent("Se muestran anuncios.");
    expect(group).toHaveTextContent("Para quitarlos, compra «Quitar anuncios» en la app Speed Deck para Android mientras esté conectada a esta computadora. Se quitan aquí y en ese teléfono.");
    act(() => emit({ type: "ads-changed", ads: { adsFree: true, grantedBy: { deviceName: "Pixel 8", grantedAt: 2 } } }));
    await waitFor(() => expect(group).toHaveTextContent("Anuncios quitados gracias a la compra hecha en Pixel 8."));
  });
});
