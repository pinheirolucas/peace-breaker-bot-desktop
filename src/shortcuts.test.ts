import { describe, expect, it } from "vitest";
import {
  acceleratorFor,
  isShortcutRequest,
  maxShortcutKeys,
  modifiersFor
} from "../electron/shortcuts";
import type { GlobalModifier } from "../electron/shortcuts";

describe("modifiersFor", () => {
  it("offers three presets per OS, default first", () => {
    expect(modifiersFor("darwin")).toEqual(["ctrl-alt", "ctrl-shift", "cmd-alt"]);
    expect(modifiersFor("win32")).toEqual(["ctrl-alt-shift", "ctrl-shift", "ctrl-alt"]);
    expect(modifiersFor("linux")).toEqual(["ctrl-alt-shift", "ctrl-shift", "super-alt"]);
  });

  it("never defaults to Ctrl+Alt off macOS, where it is AltGr on ABNT2", () => {
    expect(modifiersFor("win32")[0]).not.toBe("ctrl-alt");
    expect(modifiersFor("linux")[0]).not.toBe("ctrl-alt");
  });
});

describe("acceleratorFor", () => {
  it.each<[GlobalModifier, string]>([
    ["ctrl-alt", "Control+Alt+V"],
    ["ctrl-shift", "Control+Shift+V"],
    ["cmd-alt", "Command+Alt+V"],
    ["ctrl-alt-shift", "Control+Alt+Shift+V"],
    ["super-alt", "Super+Alt+V"]
  ])("builds %s", (modifier, expected) => {
    expect(acceleratorFor(modifier, "v")).toBe(expected);
  });

  it("keeps digits as they are", () => {
    expect(acceleratorFor("ctrl-alt", "1")).toBe("Control+Alt+1");
  });
});

describe("isShortcutRequest", () => {
  const valid = { enabled: true, modifier: "ctrl-alt-shift", keys: ["v", "1"] };

  it("accepts a well-formed request", () => {
    expect(isShortcutRequest(valid, "win32")).toBe(true);
    expect(isShortcutRequest({ ...valid, keys: [] }, "win32")).toBe(true);
  });

  it("rejects anything that is not a request", () => {
    expect(isShortcutRequest(null, "win32")).toBe(false);
    expect(isShortcutRequest("v", "win32")).toBe(false);
    expect(isShortcutRequest({ ...valid, enabled: "yes" }, "win32")).toBe(false);
  });

  it("rejects a url, a duplicate, a non-ASCII letter and an upper-case key", () => {
    expect(isShortcutRequest({ ...valid, keys: ["https://x.test/a"] }, "win32")).toBe(false);
    expect(isShortcutRequest({ ...valid, keys: ["v", "v"] }, "win32")).toBe(false);
    expect(isShortcutRequest({ ...valid, keys: ["ç"] }, "win32")).toBe(false);
    expect(isShortcutRequest({ ...valid, keys: ["V"] }, "win32")).toBe(false);
  });

  it("rejects more keys than a board needs", () => {
    const all = [..."abcdefghijklmnopqrstuvwxyz0123456789"];
    expect(all).toHaveLength(maxShortcutKeys);
    expect(isShortcutRequest({ ...valid, keys: all }, "win32")).toBe(true);
    expect(isShortcutRequest({ ...valid, keys: [...all, "a"] }, "win32")).toBe(false);
  });

  it("rejects another OS's modifier", () => {
    expect(isShortcutRequest({ ...valid, modifier: "cmd-alt" }, "win32")).toBe(false);
    expect(isShortcutRequest({ ...valid, modifier: "ctrl-alt-shift" }, "darwin")).toBe(false);
    expect(isShortcutRequest({ ...valid, modifier: "cmd-alt" }, "darwin")).toBe(true);
  });
});
