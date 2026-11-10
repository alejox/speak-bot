/** Path of the OBS dock view, relative to the app base ("/" on the desktop server). */
export const DOCK_PATH = "dock";

/** True when `pathname` is the OBS dock view (`<base>dock`, with or without a trailing slash). */
export function isDockPath(pathname: string, base: string): boolean {
  const root = base.endsWith("/") ? base : `${base}/`;
  if (!pathname.startsWith(root)) return false;
  const rest = pathname.slice(root.length).replace(/\/+$/, "");
  return rest === DOCK_PATH;
}
