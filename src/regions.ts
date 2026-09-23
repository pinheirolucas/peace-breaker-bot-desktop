import type { LanguageId } from "./i18n/detect";

// The countries MyInstants can browse. Each was checked to return a populated
// listing at myinstants.com/en/index/{code}/. The list is curated rather than
// open-ended because an unknown code is not an error there: it answers 200
// with an empty page, which would look like a broken catalogue.
//
// Codes are two lowercase letters, which is exactly what the backend accepts
// (`^[a-z]{2}$`); anything else it rejects with invalid_region.
export const REGIONS = [
  "us",
  "br",
  "pt",
  "gb",
  "es",
  "mx",
  "ar",
  "co",
  "cl",
  "pe",
  "fr",
  "de",
  "it",
  "nl",
  "in",
  "jp",
  "kr",
  "ru",
  "ca",
  "au",
  "ph",
  "id"
] as const;

export type Region = (typeof REGIONS)[number];

export const DEFAULT_REGION: Region = "br";

export function isRegion(value: unknown): value is Region {
  return (REGIONS as readonly unknown[]).includes(value);
}

const displayNamesByLanguage = new Map<LanguageId, Intl.DisplayNames | null>();

export function regionLabel(region: Region, language: LanguageId): string {
  let displayNames = displayNamesByLanguage.get(language);

  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames([language], { type: "region" });
    } catch {
      displayNames = null;
    }
    displayNamesByLanguage.set(language, displayNames);
  }

  return displayNames?.of(region.toUpperCase()) ?? region.toUpperCase();
}

/** Every region with its label in `language`, sorted by that label. */
export function regionOptions(language: LanguageId): { value: Region; label: string }[] {
  return REGIONS.map((value) => ({ value, label: regionLabel(value, language) })).sort((a, b) =>
    a.label.localeCompare(b.label, language)
  );
}
