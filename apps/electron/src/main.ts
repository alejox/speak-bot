import { startDesktop, type RunningDesktop } from "@speed-deck/desktop";
import { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, Notification, shell, Tray, type MenuItemConstructorOptions } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { externalLinkPolicy, type LinkDecision } from "./external-links";
import { isLinuxAutostartEnabled, linuxAutostartEntry, linuxAutostartFile, migrateLinuxAutostart, setLinuxAutostart } from "./linux-autostart";
import { resolveAppPaths } from "./paths";
import { installQuitOnSignals } from "./quit-signals";
import { isServiceWorkerRequest } from "./service-worker";
import { HIDDEN_FLAG, shouldStartHidden } from "./startup";
import { trayStrings, type TrayStrings } from "./tray-strings";
import { AppUpdateController, type UpdateNotice, type UpdaterBackend } from "./update/app-update-controller";
import { createElectronUpdaterBackend } from "./update/electron-updater-backend";
import { trayUpdateItem, updateNotification } from "./update/tray-update-item";
import { updateMode } from "./update/update-mode";

const paths = resolveAppPaths({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  bundleDir: __dirname,
  platform: process.platform,
});
const log = (message: string) => console.log(`[speed-deck] ${message}`);
/** Same as `appId` in electron-builder.yml: Windows shows notifications only for an app that names itself. */
const APP_USER_MODEL_ID = "io.github.alejox.speeddeck";
const INSTALL_START_TIMEOUT_MS = 10_000;

let desktop: RunningDesktop | undefined;
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;
let strings: TrayStrings = trayStrings(undefined);
let updater: AppUpdateController | undefined;
/** The update item as last drawn in the tray, so download progress does not rebuild the menu. */
let drawnUpdateItem = "";

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
    updater?.stop();
    if (!desktop) return;
    event.preventDefault();
    const running = desktop;
    desktop = undefined;
    log("Stopping the server…");
    // The quit already ran its course up to here; a second app.quit() is ignored when it started
    // from a signal (Chromium handles SIGTERM itself), so finish with app.exit().
    void running
      .close()
      .catch((error: unknown) => log(`Could not stop the server cleanly: ${String(error)}`))
      .finally(() => app.exit(0));
  });
  // The server keeps running for OBS and the phone while the window is closed.
  app.on("window-all-closed", () => {});
  // `kill`, Ctrl+C and logouts go through the same clean quit as "Quit" in the tray.
  installQuitOnSignals({ process, quit: () => app.quit(), exit: (code) => app.exit(code) });

  app.whenReady().then(start, (error: unknown) => fail(error));
}

async function start(): Promise<void> {
  if (process.platform === "win32") app.setAppUserModelId(APP_USER_MODEL_ID);
  try {
    updater = createUpdater();
    desktop = await startDesktop({ mobileDistDir: paths.mobileDistDir, overlayFile: paths.overlayFile, log, appUpdater: updater });
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
  // The tray follows the update state; the first check comes a little later, never before the window.
  updater?.subscribe((state) => {
    if (JSON.stringify(trayUpdateItem(state, strings)) !== drawnUpdateItem) refreshTrayMenu();
  });
  updater?.start();
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
    // Wide enough for the three-pane board editor (1000px and up).
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 480,
    title: "Speed Deck",
    icon: paths.windowIcon,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // Links to other sites (sponsors) open in the default browser, only when https, never inside the app.
  const links = externalLinkPolicy(origin);
  created.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(links.open(url));
    return { action: "deny" };
  });
  created.webContents.on("will-navigate", (event, url) => {
    const decision = links.navigate(url);
    if (decision.allow) return;
    event.preventDefault();
    openExternal(decision);
  });

  // Closing the window only hides it; "Quit" in the tray really quits.
  created.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    created.hide();
    if (process.platform === "darwin") app.dock?.hide();
  });

  created.once("ready-to-show", () => created.show());
  void loadWithoutServiceWorker(created, origin);
  return created;
}

/**
 * Loads the app with no PWA service worker: blocks it from registering and removes any worker
 * (and its cached UI) left by an earlier version, so an update always shows the new UI.
 * Local storage, where boards and settings live, is not touched.
 */
async function loadWithoutServiceWorker(window: BrowserWindow, origin: string): Promise<void> {
  const { session } = window.webContents;
  session.webRequest.onBeforeRequest({ urls: [`${origin}/*`] }, ({ url }, callback) => {
    callback({ cancel: isServiceWorkerRequest(url, origin) });
  });
  try {
    await session.clearStorageData({ origin, storages: ["serviceworkers", "cachestorage"] });
  } catch {
    // A failed cleanup only means a stale UI may show once; the app still loads.
  }
  await window.loadURL(`${origin}/`);
}

function openExternal(decision: LinkDecision): void {
  if (!decision.allow && decision.openExternal) void shell.openExternal(decision.openExternal);
}

/**
 * The updater for this installation: downloads and installs on Windows and for a Linux AppImage, only
 * announces on macOS and for a Linux .deb, and does nothing in development or without an update source.
 */
function createUpdater(): AppUpdateController {
  const mode = updateMode({
    platform: process.platform,
    isPackaged: app.isPackaged,
    appImage: process.env.APPIMAGE,
    hasUpdateConfig: existsSync(join(process.resourcesPath, "app-update.yml")),
  });
  const noticeFile = join(app.getPath("userData"), "update-notice.json");
  let backend: UpdaterBackend | undefined;
  if (mode !== "disabled") {
    try {
      const appImage = process.platform === "linux" && Boolean(process.env.APPIMAGE);
      backend = createElectronUpdaterBackend({ appImage, log, beforeInstall: releaseForInstall });
    } catch (error) {
      // The app works the same without updates; Settings then shows the version only.
      log(`Updates are off, the updater could not start: ${String(error)}`);
    }
  }
  return new AppUpdateController({
    currentVersion: app.getVersion(),
    mode,
    backend,
    now: () => Date.now(),
    log,
    notify: showUpdateNotification,
    notified: {
      load: () => {
        if (!existsSync(noticeFile)) return undefined;
        const { version } = JSON.parse(readFileSync(noticeFile, "utf8")) as { version?: unknown };
        return typeof version === "string" ? version : undefined;
      },
      save: (version) => writeFileSync(noticeFile, JSON.stringify({ version })),
    },
  });
}

/** One quiet system notification per version; pressing it opens the window. Never a dialog. */
function showUpdateNotification(notice: UpdateNotice): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ ...updateNotification(notice, strings), silent: true });
  notification.on("click", () => showWindow());
  notification.show();
}

/**
 * Before restarting to install: stops the server and lets go of the single-instance lock, so the updated
 * app can take the same port and the lock even if it starts while this one is still quitting.
 */
async function releaseForInstall(): Promise<void> {
  isQuitting = true;
  const running = desktop;
  desktop = undefined;
  // Lets the answer to the request that asked for the restart leave first.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await running?.close().catch((error: unknown) => log(`Could not stop the server cleanly: ${String(error)}`));
  app.releaseSingleInstanceLock();
  // The installer quits the app within moments. If it could not start, come back as the current version
  // instead of staying open with the server stopped.
  setTimeout(() => {
    log("The update did not start; restarting Speed Deck.");
    app.relaunch();
    app.quit();
  }, INSTALL_START_TIMEOUT_MS);
}

/** The tray's update item: check, download progress, restart to update, or the download page. */
function updateMenuItems(): MenuItemConstructorOptions[] {
  const item = updater ? trayUpdateItem(updater.state(), strings) : null;
  drawnUpdateItem = JSON.stringify(item);
  if (!item || !updater) return [];
  const current = updater;
  const run = {
    check: () => void current.check(),
    install: () => void current.install(),
    // Through the same https-only rule as every other link that leaves the app.
    "open-release": () => openExternal(externalLinkPolicy("").open(current.state().releaseUrl ?? "")),
    none: () => {},
  }[item.action];
  return [{ label: item.label, enabled: item.enabled, click: run }, { type: "separator" }];
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
      ...updateMenuItems(),
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
