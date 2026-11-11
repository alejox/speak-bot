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

describe("ad banner", () => {
  it("shows the house banner on the Deck, never on Voice, and leads to Settings → Remove ads", async () => {
    const { user } = await openRemoteDeck();
    const ad = await screen.findByRole("region", { name: "Advertisement" });
    expect(within(ad).getByText("Ad")).toBeInTheDocument();
    await user.click(within(ad).getByRole("button", { name: "Remove ads for USD 12" }));
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

  it("is hidden when the computer has a license, and follows license changes at once", async () => {
    const { emit } = await openRemoteDeck({ license: { adsFree: true, canActivate: true, maskedKey: "••••4D51" } }, "192.168.1.20");
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(banner()).not.toBeInTheDocument();

    act(() => emit({ type: "license-changed", license: { adsFree: false, canActivate: true } }));
    expect(await screen.findByRole("region", { name: "Advertisement" })).toBeInTheDocument();

    act(() => emit({ type: "license-changed", license: { adsFree: true, canActivate: true } }));
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
  });

  it("always shows the house banner on a phone without the computer", async () => {
    const { user } = renderLocalApp({ boards: boards() });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(user, "Deck");
    const ad = await screen.findByRole("region", { name: "Advertisement" });
    await user.click(within(ad).getByRole("button", { name: "Remove ads for USD 12" }));
    const group = screen.getByRole("group", { name: "Remove ads" });
    expect(group).toHaveTextContent("Removing ads needs the Speed Deck computer app.");
    expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("is in Spanish with the Spanish interface", async () => {
    const state = desktopState({ boards: boards() });
    const { user } = renderRemoteApp({ state, language: "es" });
    await screen.findByRole("button", { name: "Hi" });
    await user.click(within(screen.getByRole("navigation", { name: "Secciones" })).getAllByRole("link")[0]!);
    const ad = await screen.findByRole("region", { name: "Publicidad" });
    expect(within(ad).getByText("Anuncio")).toBeInTheDocument();
    expect(within(ad).getByRole("button", { name: "Quita los anuncios por USD 12" })).toBeInTheDocument();
  });
});

describe("Settings → Remove ads", () => {
  async function openSettings(options: Parameters<typeof desktopState>[0] = {}, hostname = "127.0.0.1") {
    const state = desktopState({ boards: boards(), ...options });
    const remote = renderRemoteApp({ state, hostname });
    await screen.findByRole("button", { name: "Hi" });
    await goTo(remote.user, "Settings");
    const group = await screen.findByRole("group", { name: "Remove ads" });
    return { ...remote, group };
  }

  it("activates a key on the computer and then offers to remove it", async () => {
    const { user, group, requests } = await openSettings({ license: { adsFree: false, canActivate: true, checkoutUrl: "https://store.example/buy" } });
    const buy = within(group).getByRole("link", { name: "Buy for USD 12" });
    expect(buy).toHaveAttribute("href", "https://store.example/buy");
    expect(buy).toHaveAttribute("target", "_blank");
    expect(buy).toHaveAttribute("rel", "noopener noreferrer");
    expect(group).toHaveTextContent("Ads are shown.");

    await user.type(within(group).getByRole("textbox", { name: "License key" }), "ABCD-1234");
    await user.click(within(group).getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(group).toHaveTextContent("Ads are removed (key ••••1234)."));
    expect(writes(requests)).toContain("PUT /api/license");
    expect(requests.find((request) => request.method === "PUT" && request.url === "/api/license")?.body).toEqual({ key: "ABCD-1234" });
    expect(within(group).queryByRole("link", { name: "Buy for USD 12" })).not.toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: "Remove license" }));
    await waitFor(() => expect(group).toHaveTextContent("Ads are shown."));
    expect(writes(requests)).toContain("DELETE /api/license");
  });

  it("explains why a key was refused", async () => {
    const cases: Array<[string, string]> = [
      ["license-invalid", "That license key is not valid."],
      ["license-wrong-product", "That license key is for another product."],
      ["license-limit", "That license key is already active on as many computers as it allows."],
      ["license-offline", "Could not reach the license server. Check the internet connection and try again."],
    ];
    for (const [code, message] of cases) {
      const { user, group, view } = await openSettings({ licenseError: { status: 400, body: { error: "No.", code } } });
      await user.type(within(group).getByRole("textbox", { name: "License key" }), "WRONG");
      await user.click(within(group).getByRole("button", { name: "Activate" }));
      expect(await screen.findByText(message)).toHaveAttribute("role", "status");
      view.unmount();
      localStorage.clear();
    }
  });

  it("does not activate an empty key", async () => {
    const { user, group, requests } = await openSettings();
    await user.click(within(group).getByRole("button", { name: "Activate" }));
    expect(writes(requests)).not.toContain("PUT /api/license");
    expect(await screen.findByText("Type the license key from your purchase email.")).toHaveAttribute("role", "status");
  });

  it("only shows the status on a paired phone", async () => {
    const { group } = await openSettings({ license: { adsFree: true, canActivate: true, maskedKey: "••••4D51" } }, "192.168.1.20");
    await waitFor(() => expect(group).toHaveTextContent("Ads are removed (key ••••4D51)."));
    expect(group).toHaveTextContent("Ads are removed or activated on the computer, in the Speed Deck app.");
    expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    expect(within(group).queryByRole("link")).not.toBeInTheDocument();
  });

  it("hides the key field when the computer app cannot activate keys", async () => {
    const { group } = await openSettings({ license: { adsFree: false, canActivate: false } });
    await waitFor(() => expect(group).toHaveTextContent("This version of Speed Deck cannot remove ads yet."));
    expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
