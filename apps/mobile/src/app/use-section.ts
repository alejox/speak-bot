import { useState } from "react";
import { getLocalStorage, readJson, writeJson } from "../adapters/browser-storage";

export const SECTIONS = ["board", "speak", "connect", "settings"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_STORAGE_KEY = "speed-deck:section";

function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

/** The section shown in the main area, remembered across visits on this device. */
export function useSection(storage: Storage | null = getLocalStorage()): [Section, (section: Section) => void] {
  const [section, setSection] = useState<Section>(() => {
    const stored = readJson(storage, SECTION_STORAGE_KEY);
    return isSection(stored) ? stored : "board";
  });
  return [
    section,
    (next) => {
      setSection(next);
      writeJson(storage, SECTION_STORAGE_KEY, next);
    },
  ];
}

export const NAV_COLLAPSED_STORAGE_KEY = "speed-deck:nav-collapsed";

/** Whether the side menu shows icons only (wide screens), remembered on this device; expanded by default. */
export function useNavCollapsed(storage: Storage | null = getLocalStorage()): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => readJson(storage, NAV_COLLAPSED_STORAGE_KEY) === true);
  return [
    collapsed,
    (next) => {
      setCollapsed(next);
      writeJson(storage, NAV_COLLAPSED_STORAGE_KEY, next);
    },
  ];
}
