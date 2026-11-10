import { startDesktop, type RunningDesktop } from "@speed-deck/desktop";
import { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, shell, Tray } from "electron";
import { homedir } from "node:os";
import { isLinuxAutostartEnabled, linuxAutostartEntry, linuxAutostartFile, migrateLinuxAutostart, setLinuxAutostart } from "./linux-autostart";
import { resolveAppPaths } from "./paths";
import { HIDDEN_FLAG, shouldStartHidden } from "./startup";
import { trayStrings, type TrayStrings } from "./tray-strings";

const paths = resolveAppPaths({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  bundleDir: __dirname,
  platform: process.platform,
});
const log = (message: string) => console.log(`[speed-deck] ${message}`);

let desktop: RunningDesktop | undefined;
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;
let strings: TrayStrings = trayStrings(undefined);

if (!app.requestSingleInstanceLock()) {
  // Another copy is running: it receives "second-instance" and shows its window.
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("activate", () => showWindow());
  app.on("before-quit", () => {
    isQuitting = true;
  });
  app.on("will-quit", (event) => {
    if (!desktop) return;
    event.preventDefault();
    const running = desktop;
    desktop = undefined;
    void running
      .close()
      .catch((error: unknown) => log(`Could not stop the server cleanly: ${String(error)}`))
      .finally(() => app.quit());
  });
  // The server keeps running for OBS and the phone while the window is closed.
  app.on("window-all-closed", () => {});

  app.whenReady().then(start, (error: unknown) => fail(error));
}

async function start(): Promise<void> {
  try {
    desktop = await startDesktop({ mobileDistDir: paths.mobileDistDir, overlayFile: paths.overlayFile, log });
  } catch (error) {
    fail(error);
    return;
  }
  log(`Listening on port ${desktop.port}`);
  strings = trayStrings((await desktop.loadSettings().catch(() => undefined))?.language);
  // The menu follows the language chosen in the app.
  desktop.onSettingsChanged((settings) => {
    strings = trayStrings(settings.language);
    refreshTrayMenu();
  });
  if (process.platform === "linux") await migrateOldAutostart();
  createTray();
  const loginItem = process.platform === "linux" ? { wasOpenedAtLogin: false } : app.getLoginItemSettings();
  const hidden = shouldStartHidden(process.argv, loginItem.wasOpenedAtLogin);
  if (hidden && process.platform === "darwin") app.dock?.hide();
  if (!hidden) showWindow();
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox(strings.startupFailed, message);
  app.exit(1);
}

function showWindow(): void {
  if (!desktop) return;
  if (process.platform === "darwin") void app.dock?.show();
  if (!window || window.isDestroyed()) window = createWindow(desktop.port);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function createWindow(port: number): BrowserWindow {
  // IPv4 loopback is what startDesktop verified reaches this server; `localhost` may resolve to
  // [::1], where another app could be listening on the same port.
  const origin = `http://127.0.0.1:${port}`;
  const created = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 360,
    minHeight: 480,
    title: "Speed Deck",
    icon: paths.windowIcon,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // Links to other sites open in the default browser, never inside the app.
  created.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  created.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    openExternal(url);
  });

  // Closing the window only hides it; "Quit" in the tray really quits.
  created.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    created.hide();
    if (process.platform === "darwin") app.dock?.hide();
  });

  created.once("ready-to-show", () => created.show());
  void created.loadURL(`${origin}/`);
  return created;
}

function openExternal(url: string): void {
  const { protocol } = new URL(url);
  if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") void shell.openExternal(url);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(paths.trayIcon);
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Speed Deck");
  tray.on("click", () => showWindow());
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: strings.open, click: () => showWindow() },
      {
        label: strings.copyObsUrl,
        enabled: desktop !== undefined,
        click: () => desktop && clipboard.writeText(desktop.overlayUrl),
      },
      {
        label: strings.copyObsDockUrl,
        enabled: desktop !== undefined,
        click: () => desktop && clipboard.writeText(desktop.dockUrl),
      },
      { type: "separator" },
      {
        label: strings.startAtLogin,
        type: "checkbox",
        checked: isStartAtLoginEnabled(),
        click: (item) => void setStartAtLogin(item.checked).finally(refreshTrayMenu),
      },
      { type: "separator" },
      { label: strings.quit, click: () => app.quit() },
    ]),
  );
}

function isStartAtLoginEnabled(): boolean {
  if (process.platform === "linux") return isLinuxAutostartEnabled(linuxAutostartFile(homedir(), process.env));
  return app.getLoginItemSettings({ args: [HIDDEN_FLAG] }).openAtLogin;
}

/** Keeps Start at login on after the rename from Speak Bot. */
async function migrateOldAutostart(): Promise<void> {
  try {
    const entry = linuxAutostartEntry({ execPath: process.execPath, env: process.env });
    if (await migrateLinuxAutostart(homedir(), process.env, entry)) log("Moved the Start at login entry to speed-deck.desktop.");
  } catch (error) {
    log(`Could not move the Start at login entry: ${String(error)}`);
  }
}

async function setStartAtLogin(enabled: boolean): Promise<void> {
  try {
    if (process.platform === "linux") {
      const entry = linuxAutostartEntry({ execPath: process.execPath, env: process.env });
      await setLinuxAutostart(linuxAutostartFile(homedir(), process.env), enabled, entry);
      return;
    }
    // macOS reports `wasOpenedAtLogin`; Windows gets the flag as an argument.
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_FLAG] });
  } catch (error) {
    log(`Could not change "Start at login": ${String(error)}`);
  }
}
