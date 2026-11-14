import { DEFAULT_UI_LANGUAGE, isUiLanguage, type UiLanguage } from "@speed-deck/core";

export interface TrayStrings {
  open: string;
  copyObsUrl: string;
  copyObsDockUrl: string;
  startAtLogin: string;
  quit: string;
  startupFailed: string;
  checkForUpdates: string;
  downloadingUpdate: string;
  /** `{version}` is the new version. */
  restartToUpdate: string;
  downloadVersion: string;
  updateReadyTitle: string;
  updateReadyBody: string;
  updateAvailableTitle: string;
  updateAvailableBody: string;
}

/** Tray menu copy; the language follows the desktop settings, Spanish by default. */
export const TRAY_STRINGS: Record<UiLanguage, TrayStrings> = {
  es: {
    open: "Abrir Speed Deck",
    copyObsUrl: "Copiar URL de OBS",
    copyObsDockUrl: "Copiar URL del dock de OBS",
    startAtLogin: "Abrir al iniciar sesión",
    quit: "Salir de Speed Deck",
    startupFailed: "Speed Deck no pudo iniciarse",
    checkForUpdates: "Buscar actualizaciones",
    downloadingUpdate: "Descargando actualización…",
    restartToUpdate: "Reiniciar para actualizar a {version}",
    downloadVersion: "Descargar la versión {version}…",
    updateReadyTitle: "Speed Deck {version} está lista",
    updateReadyBody: "Se instalará cuando salgas de Speed Deck, o ahora mismo desde Ajustes.",
    updateAvailableTitle: "Speed Deck {version} está disponible",
    updateAvailableBody: "Descárgala desde Ajustes o desde el menú de Speed Deck.",
  },
  en: {
    open: "Open Speed Deck",
    copyObsUrl: "Copy OBS URL",
    copyObsDockUrl: "Copy OBS dock URL",
    startAtLogin: "Start at login",
    quit: "Quit Speed Deck",
    startupFailed: "Speed Deck could not start",
    checkForUpdates: "Check for updates",
    downloadingUpdate: "Downloading update…",
    restartToUpdate: "Restart to update to {version}",
    downloadVersion: "Download version {version}…",
    updateReadyTitle: "Speed Deck {version} is ready",
    updateReadyBody: "It will be installed when you quit Speed Deck, or right now from Settings.",
    updateAvailableTitle: "Speed Deck {version} is available",
    updateAvailableBody: "Download it from Settings or from the Speed Deck menu.",
  },
};

export function trayStrings(language: unknown): TrayStrings {
  return TRAY_STRINGS[isUiLanguage(language) ? language : DEFAULT_UI_LANGUAGE];
}
