import type { PresenceSettings } from "../electron/presence";
import type { Server } from "../electron/discovery";
import type { GlobalModifier } from "../electron/shortcuts";
import type { LanguageId } from "./i18n/detect";
import { clearPersisted, createPersistedState } from "./lib/persisted";
import { migrateQuickAccessStorage } from "./lib/quickAccessCompat";
import type { Region } from "./regions";
import type { ColorMode, ThemeId } from "./themes";

// Before any hook below reads its key: settings saved under quick access's old name move over once.
migrateQuickAccessStorage(window.localStorage);

export interface Instant {
  name: string;
  url: string;
  /** A letter or digit that plays this sound. */
  key?: string;
}

export const useInstantsState = createPersistedState<Instant[]>("instants");

/** The palette. Was "light" | "dark" before the token rebuild; index.html's
 *  guard migrates that shape on boot. A backup written before the change
 *  needs no migration: ImportForm only ever restores "instants". */
export const useThemeState = createPersistedState<ThemeId>("theme");

/** auto | light | dark. Split out of "theme" so both can be persisted. */
export const useColorModeState = createPersistedState<ColorMode>("colorMode");

export const useSelectedServer = createPersistedState<string | null>("selectedServer");

export const useManualServers = createPersistedState<Server[]>("manualServers");

/** The MyInstants catalogue's country. Read it through useRegion, which
 *  falls back to the default when the stored value is not a known region. */
export const useRegionState = createPersistedState<Region>("region");

/** Which site the Explorar tab browses, by its GET /api/v1/providers key.
 *  Read it through useProvider, which falls back to the default when the
 *  stored value is not in the fetched registry. */
export const useProviderState = createPersistedState<string>("provider");

export const useLanguageState = createPersistedState<LanguageId>("language");

/** The same key as the choice Configurações offers: "auto" is a key that was
 *  never written, so picking it clears the key instead of storing the word. */
export type LanguageChoice = "auto" | LanguageId;
export const useLanguageChoiceState = createPersistedState<LanguageChoice>("language");

export interface GlobalShortcutsSetting {
  enabled: boolean;
  /** Null means the OS default. */
  modifier: GlobalModifier | null;
}

/** Global keys, which work while another app has focus. */
export const useGlobalShortcutsState = createPersistedState<GlobalShortcutsSetting>("globalShortcuts");

/** What the tray icon and the quick access are set to, as one object so it
 *  reaches the main process in one piece. Read it through usePresenceSettings,
 *  which fills in whatever a stored value is missing. */
export const usePresenceSettingsState = createPersistedState<PresenceSettings>("presence");

/** Quick access's own global shortcut: a separate switch, off by default,
 *  apart from the favourite keys'. */
export const useQuickAccessShortcutState = createPersistedState<GlobalShortcutsSetting>("quickAccessShortcut");

/**
 * Every key Configurações › Dados › Restaurar configurações puts back to its
 * default. Deliberately not here: `instants`, the favourites and their keys —
 * nothing in Configurações may ever touch those — and the one-time
 * "quickAccessHintSeen" note.
 */
export const settingsKeys = [
  "theme",
  "colorMode",
  "language",
  "selectedServer",
  "manualServers",
  "region",
  "provider",
  "globalShortcuts",
  "quickAccessShortcut",
  "presence"
] as const;

/** Puts every setting back to its default, in this window and in the others. */
export function resetSettings(): void {
  clearPersisted(settingsKeys);
}

export { clearPersisted };

/** The last three clips played, newest first, by url: the command palette's "Recentes". Not a setting: Restaurar configurações leaves it. */
export const useRecentClipsState = createPersistedState<string[]>("recentClips");
