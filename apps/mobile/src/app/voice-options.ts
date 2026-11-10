import type { Voice } from "@speed-deck/core";

/** One entry of the voice picker. */
export interface VoiceOption {
  id: string;
  label: string;
}

/** The voices of one language, under the name of that language. */
export interface VoiceGroup {
  language: string;
  label: string;
  options: VoiceOption[];
}

const SEPARATOR = " · ";

/** "es-ES", "es_MX" and "ES" are all "es"; engines do not agree on separator or case. */
export function languageOf(locale: string): string {
  return (locale.trim().split(/[-_]/)[0] ?? "").toLowerCase();
}

/** A BCP 47 tag for `locale`, or null when it is not one. */
function parseLocale(locale: string): Intl.Locale | null {
  try {
    return new Intl.Locale(locale.trim().replace(/_/g, "-"));
  } catch {
    return null;
  }
}

/** The name of a language or region in `uiLanguage`, or null when the runtime cannot name it. */
function displayName(type: "language" | "region", code: string, uiLanguage: string): string | null {
  try {
    const name = new Intl.DisplayNames([uiLanguage], { type, languageDisplay: "standard" }).of(code);
    // An unknown code comes back unchanged: that is not a name.
    return name && name !== code ? capitalize(name, uiLanguage) : null;
  } catch {
    return null;
  }
}

function capitalize(text: string, uiLanguage: string): string {
  return text.charAt(0).toLocaleUpperCase(uiLanguage) + text.slice(1);
}

/** "Spanish (Spain)" for es-ES, in the interface language; the raw code when it cannot be read. */
function localeName(locale: string, uiLanguage: string): string {
  const parsed = parseLocale(locale);
  return (parsed && displayName("language", parsed.baseName, uiLanguage)) ?? locale;
}

/** "Spanish" for es-ES. */
function languageName(locale: string, uiLanguage: string): string {
  const language = languageOf(locale);
  return displayName("language", language, uiLanguage) ?? (language || locale);
}

/** "Spain" for es-ES, or null when the locale has no region. */
function regionName(locale: string, uiLanguage: string): string | null {
  const region = parseLocale(locale)?.region;
  return region ? displayName("region", region, uiLanguage) : null;
}

/** What a browser may repeat inside a voice name: the locale code and the language's name. */
function languageHints(voice: Voice, uiLanguage: string): string[] {
  const hints = [voice.lang, voice.lang.replace(/_/g, "-"), ...["en", uiLanguage].map((language) => languageName(voice.lang, language))];
  return hints.filter((hint) => hint.length > 2).map((hint) => hint.toLowerCase());
}

const TRAILING_PARENTHESES = /\s*\(((?:[^()]|\([^()]*\))*)\)$/;
const TRAILING_DASH = /\s+[-–—]\s+([^-–—]+)$/;

/**
 * The voice's own name. Browsers often append its language ("Paulina (Spanish (Mexico))",
 * "Microsoft Elvira - Spanish (Spain)"); that part is dropped because the picker already shows it.
 * Other suffixes, such as "(Enhanced)", tell voices apart and stay.
 */
export function voiceDisplayName(voice: Voice, uiLanguage: string): string {
  const hints = languageHints(voice, uiLanguage);
  let name = voice.name.trim();
  for (const pattern of [TRAILING_PARENTHESES, TRAILING_DASH]) {
    const suffix = pattern.exec(name)?.[1]?.toLowerCase();
    if (suffix && hints.some((hint) => suffix.includes(hint))) name = name.replace(pattern, "").trim();
  }
  return name || voice.name;
}

/** "Mónica · Spanish (Spain)". */
export function voiceLabel(voice: Voice, uiLanguage: string): string {
  return `${voiceDisplayName(voice, uiLanguage)}${SEPARATOR}${localeName(voice.lang, uiLanguage)}`;
}

/** The default voice first, then by name. */
function sortVoices(voices: readonly Voice[], uiLanguage: string): Voice[] {
  return [...voices].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || voiceDisplayName(a, uiLanguage).localeCompare(voiceDisplayName(b, uiLanguage), uiLanguage),
  );
}

/** The voices that speak `language` (any region), the default one first and then by name. */
export function voicesForLanguage(voices: readonly Voice[], language: string, uiLanguage: string = language): Voice[] {
  const wanted = languageOf(language);
  return sortVoices(
    voices.filter((voice) => languageOf(voice.lang) === wanted),
    uiLanguage,
  );
}

/** Every voice under its language: `language` first, the others by name. Inside a group only the region is shown. */
export function groupVoicesByLanguage(voices: readonly Voice[], language: string, uiLanguage: string): VoiceGroup[] {
  const byLanguage = new Map<string, Voice[]>();
  for (const voice of voices) {
    const key = languageOf(voice.lang);
    byLanguage.set(key, [...(byLanguage.get(key) ?? []), voice]);
  }
  const first = languageOf(language);
  return [...byLanguage.entries()]
    .map(([key, members]) => ({
      language: key,
      label: languageName(members[0]!.lang, uiLanguage),
      options: sortVoices(members, uiLanguage).map((voice) => {
        const region = regionName(voice.lang, uiLanguage);
        const name = voiceDisplayName(voice, uiLanguage);
        return { id: voice.id, label: region ? `${name}${SEPARATOR}${region}` : name };
      }),
    }))
    .sort((a, b) => Number(b.language === first) - Number(a.language === first) || a.label.localeCompare(b.label, uiLanguage));
}
