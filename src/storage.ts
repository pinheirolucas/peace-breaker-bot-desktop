import type { Server } from "../electron/discovery";
import type { LanguageId } from "./i18n/detect";
import { createPersistedState } from "./lib/persisted";
import type { Region } from "./regions";
import type { ColorMode, ThemeId } from "./themes";

export interface Instant {
  name: string;
  url: string;
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

export const useLanguageState = createPersistedState<LanguageId>("language");
