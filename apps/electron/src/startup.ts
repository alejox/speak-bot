/** Passed by the login item (Windows, Linux) so the app starts in the tray without a window. */
export const HIDDEN_FLAG = "--hidden";

/** True when the app was started at login and should stay in the tray. */
export function shouldStartHidden(argv: readonly string[], wasOpenedAtLogin: boolean): boolean {
  return wasOpenedAtLogin || argv.includes(HIDDEN_FLAG);
}
