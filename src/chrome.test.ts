import { describe, expect, it } from "vitest";
import {
  chromeKind,
  defaultChromeColors,
  desktopFor,
  isChromeColors,
  minWindowWidth,
  titleBarHeight,
  windowChromeFor
} from "../electron/chrome";

const colors = { color: "#13181d", symbolColor: "#e9edf2" };

describe("windowChromeFor", () => {
  it("keeps the real traffic lights on macOS, centred in the 52px toolbar", () => {
    const options = windowChromeFor("darwin", colors);

    expect(options.titleBarStyle).toBe("hiddenInset");
    // The lights are 12px tall: (52 - 12) / 2 = 20.
    expect(options.trafficLightPosition).toEqual({
      x: 18,
      y: (titleBarHeight.darwin - 12) / 2
    });
    expect(options.trafficLightPosition?.y).toBe(20);
  });

  it("has the OS draw the caption buttons on Windows, in the app's colours, at 48px", () => {
    const options = windowChromeFor("win32", colors);

    expect(options.titleBarStyle).toBe("hidden");
    expect(options.titleBarOverlay).toEqual({ ...colors, height: 48 });
  });

  it("draws its own header bar on GNOME, with the OS window controls over it", () => {
    const options = windowChromeFor("linux", colors, "gnome");

    expect(options.titleBarStyle).toBe("hidden");
    expect(options.titleBarOverlay).toEqual({ ...colors, height: 46 });
  });

  it("leaves the title bar to the window manager on KDE and other Linux desktops", () => {
    expect(windowChromeFor("linux", colors, "kde")).toEqual({});
    expect(windowChromeFor("linux", colors, "other")).toEqual({});
    expect(windowChromeFor("linux", colors)).toEqual({});
  });
});

describe("chromeKind", () => {
  it("merges into the OS bar on macOS, Windows and GNOME", () => {
    expect(chromeKind("darwin")).toBe("custom");
    expect(chromeKind("win32")).toBe("custom");
    expect(chromeKind("linux", "gnome")).toBe("custom");
  });

  it("leaves the bar to the window manager elsewhere", () => {
    expect(chromeKind("linux", "kde")).toBe("native");
    expect(chromeKind("linux", "other")).toBe("native");
    expect(chromeKind("linux")).toBe("native");
    expect(chromeKind("freebsd")).toBe("native");
  });
});

describe("desktopFor", () => {
  it.each([
    ["GNOME", "gnome"],
    ["ubuntu:GNOME", "gnome"],
    ["KDE", "kde"],
    ["XFCE", "other"],
    ["X-Cinnamon", "other"],
    [undefined, "other"],
    ["", "other"]
  ])("reads XDG_CURRENT_DESKTOP=%s as %s on Linux", (env, expected) => {
    expect(desktopFor("linux", env)).toBe(expected);
  });

  it("says nothing off Linux", () => {
    expect(desktopFor("darwin", "GNOME")).toBeUndefined();
    expect(desktopFor("win32", undefined)).toBeUndefined();
  });
});

describe("minWindowWidth", () => {
  it("is the narrowest the single toolbar still fits, on every platform", () => {
    expect(minWindowWidth).toBe(400);
  });
});

describe("defaultChromeColors", () => {
  it("covers the first frame with Esmalte's ground and ink in each mode", () => {
    expect(defaultChromeColors(true)).toEqual({ color: "#13181d", symbolColor: "#e9edf2" });
    expect(defaultChromeColors(false)).toEqual({ color: "#ebf0f4", symbolColor: "#181e23" });
  });
});

// The payload arrives from the renderer over IPC, so the main process only
// ever hands the OS two opaque hex colours.
describe("isChromeColors", () => {
  it("accepts two opaque hex colours", () => {
    expect(isChromeColors({ color: "#13181D", symbolColor: "#e9edf2" })).toBe(true);
  });

  it.each([
    ["an oklch value the OS cannot parse", { color: "oklch(0.2 0.01 250)", symbolColor: "#ffffff" }],
    ["shorthand hex", { color: "#fff", symbolColor: "#000000" }],
    ["hex with alpha", { color: "#13181dff", symbolColor: "#000000" }],
    ["a missing colour", { color: "#13181d" }],
    ["a non-string", { color: 1316381, symbolColor: "#000000" }],
    ["null", null],
    ["a string", "#13181d"]
  ])("rejects %s", (_label, value) => {
    expect(isChromeColors(value)).toBe(false);
  });
});
