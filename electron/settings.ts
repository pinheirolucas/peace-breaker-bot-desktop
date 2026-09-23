// The Configurações window's shared vocabulary: its sections, its channels, how
// it is addressed (a hash on the same index.html), and how a saved position is
// judged. Pure, and inlined into the sandboxed preload like chrome.ts and
// shortcuts.ts. The renderer is untrusted, so everything it sends to main goes
// through a validator here first.

/** In the order the sidebar lists them. */
export const settingsSections = [
  "general",
  "appearance",
  "server",
  "explore",
  "keys",
  "presence",
  "data"
] as const;

export type SettingsSection = (typeof settingsSections)[number];

export const defaultSettingsSection: SettingsSection = "general";

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === "string" && (settingsSections as readonly string[]).includes(value);
}

/** Aparência is a door to the main window's stage, not a pane of its own. */
export type SettingsPane = Exclude<SettingsSection, "appearance">;

export function isSettingsPane(value: unknown): value is SettingsPane {
  return isSettingsSection(value) && value !== "appearance";
}

// renderer -> main
/** Open (or focus) Configurações, optionally on a section. */
export const settingsOpenChannel = "settings:open";
/** Aparência's launcher: raise the main window and run its Aparência stage. */
export const settingsOpenAppearanceChannel = "settings:open-appearance";
// main -> the settings renderer
/** Jump to a section: sent when the window is already open. */
export const settingsSectionChannel = "settings:section";
/** A global shortcut the OS refused because another app holds it. */
export const settingsConflictChannel = "settings:conflict";

export interface SettingsOpenRequest {
  section?: SettingsSection;
}

export function isSettingsOpenRequest(value: unknown): value is SettingsOpenRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  const { section } = value as Record<string, unknown>;
  return section === undefined || isSettingsSection(section);
}

/** Which global shortcut was refused. Only quick access's is reported here: the
 *  favourites' own keys already carry a per-key status of their own. */
export type SettingsConflict = "quickAccess";

export function isSettingsConflict(value: unknown): value is SettingsConflict {
  return value === "quickAccess";
}

// ---- addressing ----
// The window is the app's own index.html at #/settings, so Vite and tsup stay
// as they are: index.tsx branches on the hash, like it does on ?quickAccess=1.

const hashPrefix = "#/settings";

export function isSettingsHash(hash: string): boolean {
  return hash === hashPrefix || hash.startsWith(`${hashPrefix}/`);
}

/** `#/settings/server` -> "server". Anything else, or Aparência (which has no pane), is the first section. */
export function sectionFromHash(hash: string): SettingsPane {
  if (!isSettingsHash(hash)) return "general";

  const section = hash.slice(hashPrefix.length + 1).split(/[/?]/)[0];
  return isSettingsPane(section) ? section : "general";
}

/** The hash a window is loaded with, `#` included. */
export function hashFor(section?: SettingsPane): string {
  return section ? `${hashPrefix}/${section}` : hashPrefix;
}

// ---- the window ----

export const settingsSize = { width: 880, height: 620 } as const;
export const settingsMinSize = { width: 640, height: 460 } as const;

/** Below this the sidebar is an icon rail, and the search moves to the top of the pane. */
export const compactWidth = 720;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How much of a remembered window has to be on a screen for it to be reachable. */
const minVisible = { width: 120, height: 60 };

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) < 100_000;
}

/**
 * A remembered position, or null when it is not to be trusted: malformed,
 * smaller than the window's minimum, or on a screen that is no longer there
 * (an unplugged monitor would otherwise leave it out of reach). The caller
 * falls back to the default size, centred.
 */
export function restoreBounds(saved: unknown, workAreas: readonly Bounds[]): Bounds | null {
  if (typeof saved !== "object" || saved === null) return null;

  const { x, y, width, height } = saved as Record<string, unknown>;
  if (!isInteger(x) || !isInteger(y) || !isInteger(width) || !isInteger(height)) return null;
  if (width < settingsMinSize.width || height < settingsMinSize.height) return null;

  const visible = workAreas.some((area) => {
    const overlapX = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
    const overlapY = Math.min(y + height, area.y + area.height) - Math.max(y, area.y);
    return overlapX >= minVisible.width && overlapY >= minVisible.height;
  });

  return visible ? { x, y, width, height } : null;
}
