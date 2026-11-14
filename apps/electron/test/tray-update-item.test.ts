import type { AppUpdateState } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { trayStrings } from "../src/tray-strings";
import { trayUpdateItem, updateNotification } from "../src/update/tray-update-item";

const en = trayStrings("en");
const es = trayStrings("es");
const auto: AppUpdateState = { currentVersion: "1.2.0", mode: "auto", status: "idle", autoCheck: true };
const notify: AppUpdateState = { ...auto, mode: "notify" };
const RELEASE = "https://github.com/alejox/speak-bot/releases/tag/v1.3.0";

describe("trayUpdateItem", () => {
  it("offers a check while there is nothing else to say", () => {
    for (const status of ["idle", "up-to-date", "error"] as const) {
      expect(trayUpdateItem({ ...auto, status }, en)).toEqual({ label: "Check for updates", enabled: true, action: "check" });
    }
    expect(trayUpdateItem(auto, es)?.label).toBe("Buscar actualizaciones");
  });

  it("cannot be pressed while a check or a download is running", () => {
    expect(trayUpdateItem({ ...auto, status: "checking" }, en)).toEqual({ label: "Check for updates", enabled: false, action: "none" });
    expect(trayUpdateItem({ ...auto, status: "downloading", latestVersion: "1.3.0", progressPercent: 40 }, en)).toEqual({ label: "Downloading update…", enabled: false, action: "none" });
    expect(trayUpdateItem({ ...auto, status: "downloading", latestVersion: "1.3.0" }, es)?.label).toBe("Descargando actualización…");
  });

  it("offers the restart once the update is downloaded", () => {
    const downloaded: AppUpdateState = { ...auto, status: "downloaded", latestVersion: "1.3.0" };
    expect(trayUpdateItem(downloaded, en)).toEqual({ label: "Restart to update to 1.3.0", enabled: true, action: "install" });
    expect(trayUpdateItem(downloaded, es)?.label).toBe("Reiniciar para actualizar a 1.3.0");
  });

  it("offers the download page where updates are installed by hand", () => {
    const available: AppUpdateState = { ...notify, status: "available", latestVersion: "1.3.0", releaseUrl: RELEASE };
    expect(trayUpdateItem(available, en)).toEqual({ label: "Download version 1.3.0…", enabled: true, action: "open-release" });
    expect(trayUpdateItem(available, es)?.label).toBe("Descargar la versión 1.3.0…");
    // Still offered when a later check could not reach GitHub.
    expect(trayUpdateItem({ ...available, status: "error" }, en)?.action).toBe("open-release");
    // Without a page there is nothing to open.
    expect(trayUpdateItem({ ...available, releaseUrl: undefined }, en)?.action).toBe("check");
  });

  it("has no item while updates are disabled", () => {
    expect(trayUpdateItem({ ...auto, mode: "disabled" }, en)).toBeNull();
  });
});

describe("updateNotification", () => {
  it("says a downloaded update is installed on restart", () => {
    expect(updateNotification({ kind: "downloaded", version: "1.3.0" }, en)).toEqual({
      title: "Speed Deck 1.3.0 is ready",
      body: "It will be installed when you quit Speed Deck, or right now from Settings.",
    });
    expect(updateNotification({ kind: "downloaded", version: "1.3.0" }, es).title).toBe("Speed Deck 1.3.0 está lista");
  });

  it("says where to get a version that is installed by hand", () => {
    expect(updateNotification({ kind: "available", version: "1.3.0" }, en)).toEqual({
      title: "Speed Deck 1.3.0 is available",
      body: "Download it from Settings or from the Speed Deck menu.",
    });
    expect(updateNotification({ kind: "available", version: "1.3.0" }, es).title).toBe("Speed Deck 1.3.0 está disponible");
  });
});
