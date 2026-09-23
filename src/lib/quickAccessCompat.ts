// What the quick access was called before it had its name: `panel`. Two things
// outlived the rename and are read here so nobody loses anything.

/** The window loads `/?quickAccess=1`. `?panel=1` is what a build from before the rename loaded. */
export function isQuickAccessWindow(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("quickAccess") === "1" || params.get("panel") === "1";
}

const settingFields = [
  ["panel", "quickAccess"],
  ["panelStyle", "quickAccessStyle"],
  ["panelClick", "quickAccessClick"]
] as const;

const movedKeys = [
  ["panelShortcut", "quickAccessShortcut"],
  ["panelHintSeen", "quickAccessHintSeen"]
] as const;

/**
 * Moves what an older build persisted to the new names, once: the old key is
 * read, the new one written, and the old one removed, so it is never read
 * again. A value already under the new name wins, so this is safe to run on
 * every launch, and in both windows, which share one localStorage.
 *
 * Backups need nothing: ImportForm only ever restores `instants`, so a file
 * that still carries the old keys is read the same as one that does not.
 */
export function migrateQuickAccessStorage(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): void {
  try {
    for (const [oldKey, newKey] of movedKeys) {
      const old = storage.getItem(oldKey);
      if (old === null) continue;

      if (storage.getItem(newKey) === null) storage.setItem(newKey, old);
      storage.removeItem(oldKey);
    }

    const raw = storage.getItem("presence");
    if (raw === null) return;

    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return;

    const settings = { ...(stored as Record<string, unknown>) };
    let changed = false;

    for (const [oldField, newField] of settingFields) {
      if (!(oldField in settings)) continue;

      if (!(newField in settings)) settings[newField] = settings[oldField];
      delete settings[oldField];
      changed = true;
    }

    if (changed) storage.setItem("presence", JSON.stringify(settings));
  } catch {
    // Storage disabled, or a value that is not JSON: nothing to carry over.
  }
}
