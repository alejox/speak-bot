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
