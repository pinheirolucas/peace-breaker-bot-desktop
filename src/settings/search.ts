import type { SettingsSection } from "../../electron/settings";
import type { PlatformId } from "../themes";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface SearchEntry {
  id: string;
  section: SettingsSection;
  title: string;
  hint: string;
}

/** The sidebar's name for a section. Barra de menus and Bandeja are one section that only macOS calls the first. */
export function sectionLabel(t: Translate, section: SettingsSection, os: PlatformId): string {
  return t(`settings.sections.${section === "presence" ? (os === "mac" ? "menuBar" : "tray") : section}`);
}

/** Every setting there is, by name and a line of description: what the search looks through. */
export function searchEntries(t: Translate, os: PlatformId): SearchEntry[] {
  const entry = (id: string, section: SettingsSection): SearchEntry => ({
    id,
    section,
    title: t(`settings.search.${id}.title`),
    hint: t(`settings.search.${id}.hint`)
  });

  return [
    entry("language", "general"),
    entry("updates", "general"),
    entry("palette", "appearance"),
    entry("mode", "appearance"),
    entry("server", "server"),
    entry("rescan", "server"),
    entry("addServer", "server"),
    entry("site", "explore"),
    entry("country", "explore"),
    entry("globalKeys", "keys"),
    entry("globalCombo", "keys"),
    entry("quickShortcut", "keys"),
    entry("inAppKeys", "keys"),
    entry(os === "mac" ? "trayMac" : "trayOther", "presence"),
    entry("quickAccess", "presence"),
    entry(os === "mac" ? "nameBeside" : "background", "presence"),
    entry("export", "data"),
    entry("import", "data"),
    entry("reset", "data")
  ];
}

/** Lower case and no accents, so "atalho" finds "Atalhos" and "musica" finds "música". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Entries whose name, description or section contain every word of the query. */
export function matchEntries(
  entries: SearchEntry[],
  query: string,
  labelOf: (section: SettingsSection) => string
): SearchEntry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  return entries.filter((entry) => {
    const haystack = normalize(`${entry.title} ${entry.hint} ${labelOf(entry.section)}`);
    return words.every((word) => haystack.includes(word));
  });
}
