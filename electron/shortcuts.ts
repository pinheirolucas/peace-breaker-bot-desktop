// Pure rules for global shortcuts, inlined into the sandboxed preload like chrome.ts.
// The main process only ever sees single-character keys, never urls.

export const shortcutsSetChannel = "shortcuts:set";
export const shortcutsFiredChannel = "shortcuts:fired";

export type GlobalModifier = "ctrl-alt" | "ctrl-shift" | "cmd-alt" | "ctrl-alt-shift" | "super-alt";

export interface ShortcutRequest {
  enabled: boolean;
  modifier: GlobalModifier;
  keys: string[];
}

/** Why a combo failed: another app holds it, or the desktop can't register any (Wayland without a portal). */
export type FailureReason = "in-use" | "unsupported";

export interface ShortcutResult {
  registered: string[];
  failed: { key: string; reason: FailureReason }[];
}

export const clipKeyPattern = /^[a-z0-9]$/;

/** Cap on what an untrusted renderer can make main register. */
export const maxShortcutKeys = 36;

/** Three modifier presets per OS, default first. Off macOS the default adds Shift because Ctrl+Alt is AltGr on ABNT2. */
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

/** Builds an Electron accelerator, e.g. "Control+Alt+V". */
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

const macGlyphs = { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", super: "" } as const;
const names = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Cmd", super: "Super" } as const;

/** A preset's own name: "⌃⌥" on macOS, "Ctrl+Alt+Shift" elsewhere. */
export function modifierLabel(platform: string, modifier: GlobalModifier): string {
  const parts = modifier.split("-") as (keyof typeof macGlyphs)[];
  return platform === "darwin"
    ? parts.map((part) => macGlyphs[part]).join("")
    : parts.map((part) => names[part]).join("+");
}
