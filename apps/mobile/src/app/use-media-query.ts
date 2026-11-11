import { useEffect, useState } from "react";

/** Whether `query` matches now; follows changes (e.g. resizing the window). False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Windows at least this wide edit keys in a side panel (the inspector) instead of a modal. */
export const INSPECTOR_QUERY = "(min-width: 1000px)";

/** Windows this narrow show the menu as a bottom tab bar instead of a sidebar. */
export const TAB_BAR_QUERY = "(max-width: 719px)";

/**
 * The tab bar layout held upright (phones, small tablets): the board is shown transposed there, each stored
 * row as a column. Width decides the layout and orientation the turn, so a narrow landscape window and every
 * sidebar layout show the board as stored.
 */
export const PORTRAIT_BOARD_QUERY = "(max-width: 719px) and (orientation: portrait)";

/**
 * Phone-sized windows (a phone on its side is short, held upright it is narrow): the Deck shows only what
 * playing needs, and its editing tools wait behind the Edit keys toggle. Two queries, either one is enough.
 */
export const COMPACT_HEIGHT_QUERY = "(max-height: 540px)";
export const COMPACT_WIDTH_QUERY = "(max-width: 600px)";

/** Sidebar layouts too short for a labelled menu (a phone on its side): the sidebar shows as the icon rail. */
export const SHORT_SIDEBAR_QUERY = "(min-width: 720px) and (max-height: 500px)";
