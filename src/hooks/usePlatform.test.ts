import { afterEach, describe, expect, it } from "vitest";
import { detectDesktop, isFindShortcut, isModShortcut, shortcutLabel } from "./usePlatform";

afterEach(() => {
  delete window.instantsPlatform;
});

function key(init: KeyboardEventInit & { key: string }) {
  return new KeyboardEvent("keydown", init);
}

describe("detectDesktop", () => {
  it("has none off Linux", () => {
    window.instantsPlatform = { os: "win", desktop: "gnome" };

    expect(detectDesktop("mac")).toBeNull();
    expect(detectDesktop("win")).toBeNull();
  });

  it("reads the bridge on Linux", () => {
    window.instantsPlatform = { os: "linux", desktop: "kde" };
    expect(detectDesktop("linux")).toBe("kde");

    window.instantsPlatform = { os: "linux", desktop: "other" };
    expect(detectDesktop("linux")).toBe("other");
  });

  it("stands GNOME in for the most common desktop when nothing says otherwise", () => {
    expect(detectDesktop("linux")).toBe("gnome");

    window.instantsPlatform = { os: "linux", desktop: "not-a-desktop" };
    expect(detectDesktop("linux")).toBe("gnome");
  });
});

describe("shortcuts", () => {
  it("labels them per platform", () => {
    expect(shortcutLabel("mac", "n")).toBe("⌘N");
    expect(shortcutLabel("win", "1")).toBe("Ctrl+1");
    expect(shortcutLabel("linux", "2")).toBe("Ctrl+2");
  });

  it("takes Cmd on macOS and Ctrl elsewhere", () => {
    expect(isModShortcut(key({ key: "1", metaKey: true }), "mac", "1")).toBe(true);
    expect(isModShortcut(key({ key: "1", ctrlKey: true }), "mac", "1")).toBe(false);
    expect(isModShortcut(key({ key: "1", ctrlKey: true }), "win", "1")).toBe(true);
    expect(isModShortcut(key({ key: "1", metaKey: true }), "linux", "1")).toBe(false);
  });

  it("ignores case, and a different key", () => {
    expect(isModShortcut(key({ key: "N", ctrlKey: true }), "win", "n")).toBe(true);
    expect(isModShortcut(key({ key: "m", ctrlKey: true }), "win", "n")).toBe(false);
  });

  it("leaves Alt and Shift combinations alone", () => {
    expect(isModShortcut(key({ key: "n", ctrlKey: true, shiftKey: true }), "win", "n")).toBe(false);
    expect(isModShortcut(key({ key: "n", ctrlKey: true, altKey: true }), "win", "n")).toBe(false);
  });

  it("keeps the find shortcut as the same rule on the f key", () => {
    expect(isFindShortcut(key({ key: "f", metaKey: true }), "mac")).toBe(true);
    expect(isFindShortcut(key({ key: "f", ctrlKey: true }), "mac")).toBe(false);
    expect(isFindShortcut(key({ key: "F", ctrlKey: true }), "win")).toBe(true);
  });
});
