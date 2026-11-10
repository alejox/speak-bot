/**
 * True when the app runs inside the Speed Deck desktop window (Electron). There the "computer"
 * is this very app, so speech and the Deck always go through it, as in the dock view.
 */
export function isDesktopShell(userAgent: string): boolean {
  return /\bElectron\//.test(userAgent);
}
