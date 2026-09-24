import { describe, expect, it } from "vitest";
import {
  compactWidth,
  hashFor,
  isSettingsConflict,
  isSettingsHash,
  isSettingsOpenRequest,
  isSettingsPane,
  isSettingsSection,
  restoreBounds,
  sectionFromHash,
  settingsMinSize,
  settingsSections,
  settingsSize
} from "../electron/settings";
import { compactForWidth } from "./hooks/useCompact";

describe("sections", () => {
  it("are the seven, in the sidebar's order", () => {
    expect([...settingsSections]).toEqual(["general", "appearance", "server", "explore", "keys", "presence", "data"]);
  });

  it("accepts only ids from that list", () => {
    for (const id of settingsSections) expect(isSettingsSection(id)).toBe(true);

    for (const value of ["", "General", "menuBar", "tray", "../data", "__proto__", "toString", 3, null, undefined, {}, ["server"]]) {
      expect(isSettingsSection(value)).toBe(false);
    }
  });

  it("has a pane for every section but Aparência, which is a launcher", () => {
    expect(isSettingsPane("appearance")).toBe(false);
    expect(settingsSections.filter(isSettingsPane)).toHaveLength(6);
  });
});

describe("isSettingsOpenRequest", () => {
  it("wants an object whose section, when it has one, is on the list", () => {
    expect(isSettingsOpenRequest({})).toBe(true);
    expect(isSettingsOpenRequest({ section: undefined })).toBe(true);
    expect(isSettingsOpenRequest({ section: "keys" })).toBe(true);
    expect(isSettingsOpenRequest({ section: "appearance" })).toBe(true);
  });

  it("rejects everything the renderer could make up", () => {
    for (const request of [null, undefined, "keys", 3, [], ["keys"], { section: "nope" }, { section: 1 }, { section: null }, { section: "keys/../x" }]) {
      expect(isSettingsOpenRequest(request)).toBe(false);
    }
  });
});

describe("isSettingsConflict", () => {
  it("knows only quick access's shortcut", () => {
    expect(isSettingsConflict("quickAccess")).toBe(true);
    expect(isSettingsConflict("globalKeys")).toBe(false);
    expect(isSettingsConflict(undefined)).toBe(false);
  });
});

describe("the hash", () => {
  it("recognises the settings page, with or without a section", () => {
    expect(isSettingsHash("#/settings")).toBe(true);
    expect(isSettingsHash("#/settings/server")).toBe(true);
    expect(isSettingsHash("")).toBe(false);
    expect(isSettingsHash("#/settingsX")).toBe(false);
    expect(isSettingsHash("#/other")).toBe(false);
  });

  it("opens on the section it names, and on the first one for anything else", () => {
    expect(sectionFromHash("#/settings/server")).toBe("server");
    expect(sectionFromHash("#/settings/data")).toBe("data");
    expect(sectionFromHash("#/settings")).toBe("general");
    expect(sectionFromHash("#/settings/nope")).toBe("general");
    // Aparência has no pane to open on.
    expect(sectionFromHash("#/settings/appearance")).toBe("general");
    expect(sectionFromHash("#/elsewhere/server")).toBe("general");
  });

  it("round-trips", () => {
    expect(hashFor()).toBe("#/settings");
    expect(hashFor("presence")).toBe("#/settings/presence");
    expect(sectionFromHash(hashFor("keys"))).toBe("keys");
  });
});

describe("restoreBounds", () => {
  const screens = [{ x: 0, y: 0, width: 1440, height: 900 }];
  const good = { x: 100, y: 80, width: 880, height: 620 };

  it("has the size the design draws and a floor under it", () => {
    expect(settingsSize).toEqual({ width: 880, height: 620 });
    expect(settingsMinSize).toEqual({ width: 640, height: 460 });
  });

  it("returns a remembered position that is on a screen", () => {
    expect(restoreBounds(good, screens)).toEqual(good);
  });

  it("does not trust anything malformed", () => {
    for (const saved of [null, undefined, "x", 3, [], {}, { ...good, x: "1" }, { ...good, width: 880.5 }, { ...good, y: NaN }, { ...good, width: Infinity }, { ...good, x: 1e9 }]) {
      expect(restoreBounds(saved, screens)).toBeNull();
    }
  });

  it("refuses a window smaller than the minimum", () => {
    expect(restoreBounds({ ...good, width: 639 }, screens)).toBeNull();
    expect(restoreBounds({ ...good, height: 459 }, screens)).toBeNull();
    expect(restoreBounds({ ...good, width: 640, height: 460 }, screens)).not.toBeNull();
  });

  it("drops a position that a removed monitor left out of reach", () => {
    expect(restoreBounds({ ...good, x: 3000 }, screens)).toBeNull();
    expect(restoreBounds({ ...good, x: 3000 }, [...screens, { x: 1440, y: 0, width: 1920, height: 1080 }])).not.toBeNull();
    // Only a sliver on screen is as good as none.
    expect(restoreBounds({ ...good, x: 1400 }, screens)).toBeNull();
  });
});

describe("compact", () => {
  it("is below 720, and an unmeasured window is not", () => {
    expect(compactWidth).toBe(720);
    expect(compactForWidth(719)).toBe(true);
    expect(compactForWidth(640)).toBe(true);
    expect(compactForWidth(720)).toBe(false);
    expect(compactForWidth(880)).toBe(false);
    expect(compactForWidth(0)).toBe(false);
  });
});
