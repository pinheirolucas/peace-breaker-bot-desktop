import { describe, expect, it } from "vitest";

import { checkForUpdatesLabel, pickDmgUrl } from "../electron/updates";

describe("pickDmgUrl", () => {
  const releaseBase =
    "https://github.com/pinheirolucas/peace-breaker-bot-desktop/releases/download/v1.2.3";

  it("resolves the .dmg entry's bare filename against the tagged release", () => {
    const url = pickDmgUrl("1.2.3", [
      { url: "App-1.2.3-arm64.zip" },
      { url: "App-1.2.3-arm64.dmg" }
    ]);

    expect(url).toBe(`${releaseBase}/App-1.2.3-arm64.dmg`);
  });

  it("matches case-insensitively", () => {
    const url = pickDmgUrl("1.2.3", [{ url: "App-1.2.3-arm64.DMG" }]);

    expect(url).toBe(`${releaseBase}/App-1.2.3-arm64.DMG`);
  });

  it("returns null for a zip-only publish", () => {
    const url = pickDmgUrl("1.2.3", [{ url: "App-1.2.3-arm64.zip" }]);

    expect(url).toBeNull();
  });

  it("returns null for a missing or malformed files list", () => {
    expect(pickDmgUrl("1.2.3", null)).toBeNull();
    expect(pickDmgUrl("1.2.3", undefined)).toBeNull();
    expect(pickDmgUrl("1.2.3", [])).toBeNull();
  });
});

describe("checkForUpdatesLabel", () => {
  it("labels in Portuguese for a pt* OS locale", () => {
    expect(checkForUpdatesLabel("pt-BR")).toBe("Verificar atualizações…");
    expect(checkForUpdatesLabel("pt-PT")).toBe("Verificar atualizações…");
    expect(checkForUpdatesLabel("pt")).toBe("Verificar atualizações…");
  });

  it("falls back to English for everything else", () => {
    expect(checkForUpdatesLabel("en-US")).toBe("Check for Updates…");
    expect(checkForUpdatesLabel("es-ES")).toBe("Check for Updates…");
  });
});
