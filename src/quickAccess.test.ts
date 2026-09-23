// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  clampHeight,
  escapeAction,
  hidesOnBlur,
  isQuickAccessAction,
  isQuickAccessShortcutRequest,
  quickAccessBounds,
  quickAccessMinHeight,
  quickAccessSize,
  resizedBounds
} from "../electron/quickAccess";

const area = { x: 0, y: 25, width: 1440, height: 875 };

describe("quickAccessBounds", () => {
  it("hangs under the menu-bar icon on macOS, centred on it", () => {
    const icon = { x: 1200, y: 0, width: 24, height: 24 };
    const box = quickAccessBounds("darwin", icon, area);

    expect(box).toMatchObject({ width: 360, height: 520, y: 33 });
    expect(box.x + box.width / 2).toBe(1212);
  });

  it("sits above a low icon on Windows, and below a high one", () => {
    const low = quickAccessBounds("win32", { x: 1300, y: 860, width: 24, height: 32 }, { ...area, y: 0 });
    expect(low.y + low.height).toBeLessThanOrEqual(860);

    const high = quickAccessBounds("win32", { x: 1300, y: 4, width: 24, height: 24 }, { ...area, y: 0 });
    expect(high.y).toBeGreaterThan(28);
  });

  it("is clamped to the work area, so an icon at the edge never pushes it off", () => {
    const corner = quickAccessBounds("darwin", { x: 1430, y: 0, width: 10, height: 24 }, area);

    expect(corner.x + corner.width).toBeLessThanOrEqual(area.x + area.width);
    expect(corner.x).toBeGreaterThanOrEqual(area.x);

    const left = quickAccessBounds("darwin", { x: 0, y: 0, width: 10, height: 24 }, area);
    expect(left.x).toBeGreaterThanOrEqual(area.x);
  });

  it("centres a floating window on Linux, whatever the icon says", () => {
    const box = quickAccessBounds("linux", { x: 10, y: 10, width: 24, height: 24 }, area);

    expect(box.x + box.width / 2).toBe(720);
    expect(Math.abs(box.y + box.height / 2 - (area.y + area.height / 2))).toBeLessThanOrEqual(1);
  });

  it("treats unknown icon bounds like no anchor", () => {
    const box = quickAccessBounds("darwin", { x: 0, y: 0, width: 0, height: 0 }, area);
    expect(box.x + box.width / 2).toBe(720);
    expect(quickAccessBounds("win32", null, area).x).toBe(box.x);
  });

  it("fits a display smaller than quick access by pinning it to the margin", () => {
    const tiny = { x: 0, y: 0, width: 300, height: 400 };
    const box = quickAccessBounds("win32", null, tiny);
    expect(box.x).toBe(8);
    expect(box.y).toBe(8);
  });
});

describe("resizedBounds", () => {
  it("keeps the top edge when quick access hangs under the icon", () => {
    const open = { x: 100, y: 33, width: 360, height: 520 };
    expect(resizedBounds(open, 300, area)).toMatchObject({ y: 33, height: 300 });
  });

  it("keeps the bottom edge when it sits above the icon", () => {
    const open = { x: 100, y: 340, width: 360, height: 520 };
    const next = resizedBounds(open, 300, area);

    expect(next.y + next.height).toBe(860);
  });

  it("holds the height to what quick access may be", () => {
    expect(clampHeight(10)).toBe(quickAccessMinHeight);
    expect(clampHeight(9000)).toBe(quickAccessSize.height);
    expect(clampHeight(333.4)).toBe(333);
  });
});

describe("isQuickAccessAction", () => {
  it("accepts quick access's own verbs", () => {
    for (const type of ["hide", "open-app", "refresh", "settings", "quit"]) {
      expect(isQuickAccessAction({ type })).toBe(true);
    }
    expect(isQuickAccessAction({ type: "pin", pinned: true })).toBe(true);
    expect(isQuickAccessAction({ type: "resize", height: 300 })).toBe(true);
  });

  it.each([
    null,
    "hide",
    {},
    { type: "rm" },
    { type: "pin" },
    { type: "pin", pinned: "yes" },
    { type: "resize", height: "300" },
    { type: "resize", height: NaN }
  ])("refuses %j", (value) => {
    expect(isQuickAccessAction(value)).toBe(false);
  });
});

describe("isQuickAccessShortcutRequest", () => {
  it("accepts a switch and a modifier this OS offers", () => {
    expect(isQuickAccessShortcutRequest({ enabled: true, modifier: "ctrl-alt" }, "darwin")).toBe(true);
    expect(isQuickAccessShortcutRequest({ enabled: false, modifier: "ctrl-alt-shift" }, "win32")).toBe(true);
  });

  it("refuses one this OS does not offer, and anything malformed", () => {
    expect(isQuickAccessShortcutRequest({ enabled: true, modifier: "cmd-alt" }, "win32")).toBe(false);
    expect(isQuickAccessShortcutRequest({ enabled: "on", modifier: "ctrl-alt" }, "darwin")).toBe(false);
    expect(isQuickAccessShortcutRequest({ enabled: true, modifier: "Control+Alt" }, "darwin")).toBe(false);
    expect(isQuickAccessShortcutRequest(null, "darwin")).toBe(false);
  });
});

describe("hidesOnBlur", () => {
  it("hides unless pinned or a drag from quick access is in flight", () => {
    expect(hidesOnBlur({ pinned: false, dragging: false })).toBe(true);
    expect(hidesOnBlur({ pinned: true, dragging: false })).toBe(false);
    expect(hidesOnBlur({ pinned: false, dragging: true })).toBe(false);
  });
});

describe("escapeAction", () => {
  it("stops playback first, clears the query second, hides last", () => {
    expect(escapeAction({ playing: true, query: "vine" })).toBe("stop");
    expect(escapeAction({ playing: false, query: "vine" })).toBe("clear");
    expect(escapeAction({ playing: false, query: "" })).toBe("hide");
  });
});
