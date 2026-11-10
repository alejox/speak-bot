import { DEFAULT_UI_LANGUAGE, isUiLanguage, type UiLanguage } from "@speak-bot/core";

export interface TrayStrings {
  open: string;
  copyObsUrl: string;
  copyObsDockUrl: string;
  startAtLogin: string;
  quit: string;
  startupFailed: string;
}

/** Tray menu copy; the language follows the desktop settings, Spanish by default. */
export const TRAY_STRINGS: Record<UiLanguage, TrayStrings> = {
  es: {
    open: "Abrir Speak Bot",
    copyObsUrl: "Copiar URL de OBS",
    copyObsDockUrl: "Copiar URL del dock de OBS",
    startAtLogin: "Abrir al iniciar sesión",
    quit: "Salir de Speak Bot",
    startupFailed: "Speak Bot no pudo iniciarse",
  },
  en: {
    open: "Open Speak Bot",
    copyObsUrl: "Copy OBS URL",
    copyObsDockUrl: "Copy OBS dock URL",
    startAtLogin: "Start at login",
    quit: "Quit Speak Bot",
    startupFailed: "Speak Bot could not start",
  },
};

export function trayStrings(language: unknown): TrayStrings {
  return TRAY_STRINGS[isUiLanguage(language) ? language : DEFAULT_UI_LANGUAGE];
}
