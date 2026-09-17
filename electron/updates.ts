// Pure update-manifest helpers and channel names. Kept free of electron and
// electron-updater imports so they can be unit-tested directly
// (src/updates.test.ts) and so the preload — sandboxed, cannot require a
// sibling module at runtime — can have them inlined at build time instead,
// the same way discovery.ts and chrome.ts are.

// main -> renderer
export const updateAvailableChannel = "updates:available"; // Linux: check only, no download
export const updateDownloadedChannel = "updates:downloaded"; // macOS: dmg fetched, ready to open
export const updateRestartReadyChannel = "updates:restart-ready"; // Windows: applied, ready to restart
// Only ever sent for a manual check — the hourly background one stays
// silent either way, the same as before this existed.
export const updateNotAvailableChannel = "updates:not-available";
export const updateCheckFailedChannel = "updates:check-failed";

// renderer -> main
export const openReleasePageChannel = "updates:open-release-page";
export const openUpdateChannel = "updates:open";
export const restartToUpdateChannel = "updates:restart";
// Windows/Linux only: the app's own overflow menu, in place of the native
// menu item macOS gets in its app menu (those platforms have no window
// menu bar at all in this app's custom chrome).
export const checkForUpdatesChannel = "updates:check";

export const releasePageUrl =
  "https://github.com/pinheirolucas/peace-breaker-bot-desktop/releases/latest";

const releaseAssetBaseUrl =
  "https://github.com/pinheirolucas/peace-breaker-bot-desktop/releases/download";

/** The subset of electron-updater's UpdateFileInfo this app actually reads. */
export interface UpdateFile {
  url: string;
}

/**
 * Picks the .dmg's download URL out of the files electron-builder lists in
 * latest-mac.yml. electron-updater's own downloadUpdate() targets the .zip —
 * the artifact Squirrel.Mac would apply — but unsigned builds can't go
 * through Squirrel at all, so this app fetches the dmg instead: the file a
 * person actually double-clicks.
 */
export function pickDmgUrl(
  version: string,
  files: readonly UpdateFile[] | null | undefined
): string | null {
  if (!Array.isArray(files)) {
    return null;
  }

  const dmg = files.find(
    (file) => typeof file?.url === "string" && file.url.toLowerCase().endsWith(".dmg")
  );

  return dmg ? `${releaseAssetBaseUrl}/v${version}/${dmg.url}` : null;
}

/**
 * Labels the native "Check for Updates" item in macOS's app menu. The main
 * process has no access to the persisted language setting the renderer's
 * own i18n catalogs read (that's renderer-only state) — this reads the OS
 * locale directly instead, bucketed the same pt-vs-everything-else way as
 * src/i18n/detect.ts's defaultLocale.
 */
export function checkForUpdatesLabel(osLocale: string): string {
  const primary = osLocale.split("-")[0]?.toLowerCase();
  return primary === "pt" ? "Verificar atualizações…" : "Check for Updates…";
}
