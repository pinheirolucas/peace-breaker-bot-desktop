// Global shortcuts: the same key a favourite has in the window, plus one
// modifier, reaching the app while another one has focus. Pure and
// types-only against electron, like chrome.ts: unit-tested from
// src/shortcuts.test.ts, and inlined into the sandboxed preload at build time.
//
// The main process knows keys, never urls. The renderer stays the only owner
// of favourites; main validates a list of single characters, registers them,
// and echoes a character back when one fires.

export const shortcutsSetChannel = "shortcuts:set";
export const shortcutsFiredChannel = "shortcuts:fired";

export type GlobalModifier =
  | "ctrl-alt"
  | "ctrl-shift"
  | "cmd-alt"
  | "ctrl-alt-shift"
  | "super-alt";

export interface ShortcutRequest {
  enabled: boolean;
  modifier: GlobalModifier;
  keys: string[];
}

/** Why a combo was not registered. "in-use": another app holds it.
 *  "unsupported": the desktop offers no way to register one at all
 *  (Wayland without the GlobalShortcuts portal). */
export type FailureReason = "in-use" | "unsupported";

export interface ShortcutResult {
  registered: string[];
  failed: { key: string; reason: FailureReason }[];
}

/** A key a favourite can have: one letter or digit, as printed. */
export const clipKeyPattern = /^[a-z0-9]$/;

/** More than a board needs, and a hard cap on what an untrusted renderer can
 *  make the main process register. */
export const maxShortcutKeys = 36;

/** Three presets per OS, default first. Chosen from a list rather than
 *  recorded freely: a free recorder lets people pick combos that break typing
 *  in other apps, and Ctrl+Alt is AltGr on Windows with ABNT2 and most
 *  international layouts — which is why the default off macOS adds Shift. */
export function modifiersFor(platform: string): GlobalModifier[] {
  if (platform === "darwin") return ["ctrl-alt", "ctrl-shift", "cmd-alt"];
  if (platform === "win32") return ["ctrl-alt-shift", "ctrl-shift", "ctrl-alt"];
  return ["ctrl-alt-shift", "ctrl-shift", "super-alt"];
}

const accelerators: Record<GlobalModifier, string> = {
  "ctrl-alt": "Control+Alt",
  "ctrl-shift": "Control+Shift",
  "cmd-alt": "Command+Alt",
  "ctrl-alt-shift": "Control+Alt+Shift",
  "super-alt": "Super+Alt"
};

/** Electron's own names: "Alt" is the Option key on macOS. */
export function acceleratorFor(modifier: GlobalModifier, key: string): string {
  return `${accelerators[modifier]}+${key.toUpperCase()}`;
}

export function isShortcutRequest(x: unknown, platform: string): x is ShortcutRequest {
  const request = x as Partial<ShortcutRequest> | null;

  if (!request || typeof request !== "object" || typeof request.enabled !== "boolean") {
    return false;
  }

  if (!modifiersFor(platform).includes(request.modifier as GlobalModifier)) {
    return false;
  }

  const { keys } = request;
  if (!Array.isArray(keys) || keys.length > maxShortcutKeys) {
    return false;
  }

  return (
    keys.every((key) => typeof key === "string" && clipKeyPattern.test(key)) &&
    new Set(keys).size === keys.length
  );
}
