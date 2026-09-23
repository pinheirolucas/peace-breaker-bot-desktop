import type { GlobalModifier, ShortcutRequest, ShortcutResult } from "../../electron/shortcuts";
import { isPlatformId } from "../themes";
import type { PlatformId } from "../themes";

/** Whether Electron merged the window into the OS title bar (macOS,
 *  Windows, GNOME) or left it to the window manager — or there is no
 *  Electron. */
export type ChromeKind = "custom" | "native";

/** Which Linux desktop is running: GNOME gets the app's own header bar, the
 *  rest keep the window manager's title bar. Only meaningful on Linux. */
export type DesktopId = "gnome" | "kde" | "other";

function isDesktopId(value: unknown): value is DesktopId {
  return value === "gnome" || value === "kde" || value === "other";
}

declare global {
  interface Window {
    instantsPlatform?: {
      os?: string;
      desktop?: string;
      chrome?: string;
      setChrome?: (colors: { color: string; symbolColor: string }) => void;
    };
    instantsDiscovery?: {
      onServers: (listener: (servers: unknown[]) => void) => () => void;
      refresh: () => void;
    };
    instantsShortcuts?: {
      modifiers: GlobalModifier[];
      setGlobal: (request: ShortcutRequest) => Promise<ShortcutResult>;
      onFired: (listener: (key: string) => void) => () => void;
    };
    instantsUpdates?: {
      onAvailable: (listener: (version: string) => void) => () => void;
      onDownloaded: (listener: (info: { version: string; path: string }) => void) => () => void;
      onRestartReady: (listener: () => void) => () => void;
      // Both sent only in answer to a manual check — the native macOS app
      // menu or the app's own overflow menu on Windows/Linux — never by the
      // hourly background one.
      onNotAvailable: (listener: () => void) => () => void;
      onCheckFailed: (listener: () => void) => () => void;
      openReleasePage: () => void;
      openUpdate: (path: string) => void;
      restart: () => void;
      // Windows/Linux: the overflow menu's "Check for Updates" item.
      checkNow: () => void;
    };
  }
}

// Dev-only overrides, so every platform is reachable from one machine:
// ?os=mac|win|linux, ?desktop=gnome|kde|other and ?chrome=custom|native. The Storybook toolbar drives
// the same values. Checked first, so they win even inside Electron.
function devOverride(name: string): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  return new URLSearchParams(window.location.search).get(name);
}

export function detectPlatform(): PlatformId {
  const forced = devOverride("os");
  if (isPlatformId(forced)) {
    return forced;
  }

  // The preload bridge is the authority when it exists. It does not in a
  // plain browser tab, which is a supported way to run this app.
  const bridge = window.instantsPlatform?.os;
  if (isPlatformId(bridge)) {
    return bridge;
  }

  const ua =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.userAgent ||
    "";

  if (/mac|iphone|ipad/i.test(ua)) return "mac";
  // Not a bare /win/: "darwin" contains it.
  if (/windows|win32|win64/i.test(ua)) return "win";
  return "linux";
}

/** Null off Linux. On Linux without a bridge — a browser tab, Storybook —
 *  GNOME, the most common desktop, stands in. */
export function detectDesktop(os: PlatformId = detectPlatform()): DesktopId | null {
  if (os !== "linux") {
    return null;
  }

  const forced = devOverride("desktop");
  if (isDesktopId(forced)) {
    return forced;
  }

  const bridge = window.instantsPlatform?.desktop;
  return isDesktopId(bridge) ? bridge : "gnome";
}

export function detectChrome(): ChromeKind {
  const forced = devOverride("chrome");
  if (forced === "custom" || forced === "native") {
    return forced;
  }

  return window.instantsPlatform?.chrome === "custom" ? "custom" : "native";
}

// Neither changes within a session — the bridge is in place before any
// module runs — but both are read per call rather than cached at import, so
// a test can install a bridge before it renders.
export function usePlatform(): PlatformId {
  return detectPlatform();
}

export function useChromeKind(): ChromeKind {
  return detectChrome();
}

export function useDesktop(): DesktopId | null {
  return detectDesktop();
}

export function findShortcutLabel(os: PlatformId): string {
  return os === "mac" ? "⌘F" : "Ctrl F";
}

/** The label for a Cmd/Ctrl + key shortcut: "⌘1" on macOS, "Ctrl+1" elsewhere. */
export function shortcutLabel(os: PlatformId, key: string): string {
  return os === "mac" ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

const macGlyphs = { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", super: "" } as const;

/** A global combo as a person reads it: "⌃⌥V" on macOS, "Ctrl+Alt+Shift+V"
 *  elsewhere. The multi-modifier counterpart of shortcutLabel. */
export function comboLabel(os: PlatformId, modifier: GlobalModifier, key: string): string {
  const parts = modifier.split("-") as (keyof typeof macGlyphs)[];
  const upper = key.toUpperCase();

  if (os === "mac") {
    return parts.map((part) => macGlyphs[part]).join("") + upper;
  }

  const names = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Cmd", super: "Super" } as const;
  return [...parts.map((part) => names[part]), upper].join("+");
}

/** Cmd + key on macOS, Ctrl + key elsewhere — with no Alt or Shift, so it
 *  never eats a combination that merely contains it. */
export function isModShortcut(event: KeyboardEvent, os: PlatformId, key: string): boolean {
  if (event.key.toLowerCase() !== key.toLowerCase()) {
    return false;
  }

  if (event.altKey || event.shiftKey) {
    return false;
  }

  return os === "mac" ? event.metaKey : event.ctrlKey;
}

export function isFindShortcut(event: KeyboardEvent, os: PlatformId): boolean {
  return isModShortcut(event, os, "f");
}
