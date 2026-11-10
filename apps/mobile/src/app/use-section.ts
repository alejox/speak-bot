import { useState } from "react";
import { getLocalStorage, readJson, writeJson } from "../adapters/browser-storage";

export const SECTIONS = ["speak", "phrases", "connect", "settings"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_STORAGE_KEY = "speak-bot:section";

function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

/** The section shown in the main area, remembered across visits on this device. */
export function useSection(storage: Storage | null = getLocalStorage()): [Section, (section: Section) => void] {
  const [section, setSection] = useState<Section>(() => {
    const stored = readJson(storage, SECTION_STORAGE_KEY);
    return isSection(stored) ? stored : "speak";
  });
  return [
    section,
    (next) => {
      setSection(next);
      writeJson(storage, SECTION_STORAGE_KEY, next);
    },
  ];
}
