import type { BrowserWindowConstructorOptions } from "electron";

// Native window chrome, per platform. Types-only import from electron, so
// this stays pure: unit-tested from src/chrome.test.ts, and inlined into the
// sandboxed preload at build time the same way discovery.ts is.

export const chromeChannel = "chrome:set";

/** How the window relates to the OS title bar. "custom": Electron hides the
 *  OS bar and the app's own toolbar takes its place, with the real window
 *  controls drawn over it (macOS, Windows, and GNOME on Linux). "native":
 *  the window manager keeps its own bar and the toolbar sits under it. */
export type ChromeKind = "custom" | "native";

/** Which Linux desktop the app is running on. Only GNOME gets a
 *  client-side header bar: KDE Plasma and everything else keep the window
 *  manager's own title bar, which is what their users expect. */
export type Desktop = "gnome" | "kde" | "other";

/**
 * Reads XDG_CURRENT_DESKTOP, a colon-separated list such as
 * "ubuntu:GNOME" or "KDE". Undefined off Linux, where there is no such
 * distinction to make.
 */
export function desktopFor(platform: string, env: string | undefined): Desktop | undefined {
  if (platform !== "linux") {
    return undefined;
  }

  const names = (env ?? "").toLowerCase().split(":");

  if (names.includes("gnome")) return "gnome";
  if (names.includes("kde")) return "kde";
  return "other";
}

export function chromeKind(platform: string, desktop?: Desktop): ChromeKind {
  if (platform === "darwin" || platform === "win32") {
    return "custom";
  }

  return platform === "linux" && desktop === "gnome" ? "custom" : "native";
}

/** Height of the toolbar the OS-drawn window controls are centred in:
 *  52px on macOS, 48px on Windows (Microsoft's height for a title bar that
 *  holds a search box), 46px in a GNOME header bar. */
export const titleBarHeight = { darwin: 52, win32: 48, linux: 46 } as const;

/** The narrowest the layout is designed for. Below 400 the tabs, a magnifier,
 *  Adicionar and the overflow menu no longer fit one bar on macOS, and on
 *  Windows the caption buttons take another 138px of it. */
export const minWindowWidth = 400;

export interface ChromeColors {
  color: string;
  symbolColor: string;
}

/**
 * sRGB resolutions of Esmalte's --bg and --fg. They only cover the moment
 * before the renderer's first paint; after that it sends the real values
 * from tokens.css over chromeChannel. #13181d is also the Fita icon's ink —
 * the icon is drawn from the default theme.
 */
export function defaultChromeColors(dark: boolean): ChromeColors {
  return dark
    ? { color: "#13181d", symbolColor: "#e9edf2" }
    : { color: "#ebf0f4", symbolColor: "#181e23" };
}

export function windowChromeFor(
  platform: string,
  colors: ChromeColors,
  desktop?: Desktop
): BrowserWindowConstructorOptions {
  if (platform === "darwin") {
    // hiddenInset keeps the real traffic lights. They are 12px tall, so
    // y: 20 centres them in the 52px toolbar; x: 18 is its side padding.
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 18, y: (titleBarHeight.darwin - 12) / 2 }
    };
  }

  if (platform === "win32") {
    // The OS draws the real caption buttons over the app, in these colours.
    // They do not follow CSS, so the renderer repaints them over
    // chromeChannel whenever the palette or mode changes.
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: { ...colors, height: titleBarHeight.win32 }
    };
  }

  if (platform === "linux" && desktop === "gnome") {
    // The same window-controls overlay, which Electron draws on Linux from
    // 30.2 and lays out by the desktop's own button order. Only the height
    // and colours are ours; symbolColor is honoured on Windows alone.
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: { ...colors, height: titleBarHeight.linux }
    };
  }

  return {};
}

const OPAQUE_HEX = /^#[0-9a-f]{6}$/i;

/** The renderer is untrusted input: accept exactly two opaque hex colours. */
export function isChromeColors(value: unknown): value is ChromeColors {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { color, symbolColor } = value as Record<string, unknown>;

  return (
    typeof color === "string" &&
    OPAQUE_HEX.test(color) &&
    typeof symbolColor === "string" &&
    OPAQUE_HEX.test(symbolColor)
  );
}
