import { beforeEach, describe, expect, it } from "vitest";
import { isQuickAccessWindow, migrateQuickAccessStorage } from "./quickAccessCompat";

beforeEach(() => window.localStorage.clear());

const get = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? "null");

describe("migrateQuickAccessStorage", () => {
  it("carries the old settings over to the new names, and stops leaving the old ones behind", () => {
    window.localStorage.setItem(
      "presence",
      JSON.stringify({ tray: true, panel: true, panelStyle: "connection", panelClick: "discord", title: false, background: true })
    );

    migrateQuickAccessStorage(window.localStorage);

    expect(get("presence")).toEqual({
      tray: true,
      quickAccess: true,
      quickAccessStyle: "connection",
      quickAccessClick: "discord",
      title: false,
      background: true
    });
  });

  it("moves the shortcut and the seen-hint keys", () => {
    window.localStorage.setItem("panelShortcut", JSON.stringify({ enabled: true, modifier: null }));
    window.localStorage.setItem("panelHintSeen", "1");

    migrateQuickAccessStorage(window.localStorage);

    expect(get("quickAccessShortcut")).toEqual({ enabled: true, modifier: null });
    expect(window.localStorage.getItem("quickAccessHintSeen")).toBe("1");
    expect(window.localStorage.getItem("panelShortcut")).toBeNull();
    expect(window.localStorage.getItem("panelHintSeen")).toBeNull();
  });

  it("never overwrites a value already under the new name, and is safe to run twice", () => {
    window.localStorage.setItem("panelShortcut", JSON.stringify({ enabled: false, modifier: null }));
    window.localStorage.setItem("quickAccessShortcut", JSON.stringify({ enabled: true, modifier: "ctrl-alt" }));
    window.localStorage.setItem("presence", JSON.stringify({ tray: true, panel: false, quickAccess: true }));

    migrateQuickAccessStorage(window.localStorage);
    migrateQuickAccessStorage(window.localStorage);

    expect(get("quickAccessShortcut")).toEqual({ enabled: true, modifier: "ctrl-alt" });
    expect(get("presence")).toEqual({ tray: true, quickAccess: true });
  });

  it("leaves a fresh install, and a value that is not JSON, alone", () => {
    migrateQuickAccessStorage(window.localStorage);
    expect(window.localStorage.length).toBe(0);

    window.localStorage.setItem("presence", "not json");
    expect(() => migrateQuickAccessStorage(window.localStorage)).not.toThrow();
    expect(window.localStorage.getItem("presence")).toBe("not json");
  });
});

describe("isQuickAccessWindow", () => {
  it("takes the new parameter and the one from before the rename", () => {
    expect(isQuickAccessWindow("?quickAccess=1")).toBe(true);
    expect(isQuickAccessWindow("?panel=1")).toBe(true);
    expect(isQuickAccessWindow("")).toBe(false);
    expect(isQuickAccessWindow("?quickAccess=0")).toBe(false);
  });
});
