import type { BoardKind } from "@speed-deck/core";
import { useState } from "react";
import { getLocalStorage, readJson, writeJson } from "../adapters/browser-storage";

/** "voice" and "deck" are the two spaces, each showing the boards of that kind. */
export const SECTIONS = ["voice", "deck", "connect", "settings"] as const;
export type Section = (typeof SECTIONS)[number];

/** Sections of versions before the Voice and Deck spaces, and where each one lives now. */
const LEGACY_SECTIONS: Readonly<Record<string, Section>> = { board: "voice", speak: "voice" };

export const SECTION_STORAGE_KEY = "speed-deck:section";

function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

/** The section a stored value names; Voice for anything unknown. */
export function sectionOfStored(stored: unknown): Section {
  if (isSection(stored)) return stored;
  return (typeof stored === "string" && Object.hasOwn(LEGACY_SECTIONS, stored) ? LEGACY_SECTIONS[stored] : undefined) ?? "voice";
}

/** The space a section shows, or null for a section that is not a space. */
export function spaceOfSection(section: Section): BoardKind | null {
  return section === "voice" || section === "deck" ? section : null;
}

/** The section shown in the main area, remembered across visits on this device. */
export function useSection(storage: Storage | null = getLocalStorage()): [Section, (section: Section) => void] {
  const [section, setSection] = useState<Section>(() => sectionOfStored(readJson(storage, SECTION_STORAGE_KEY)));
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
