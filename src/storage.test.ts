import { describe, expect, it } from "vitest";
import { settingsKeys } from "./storage";

// Stored keys that Restaurar configurações must leave alone.
const notSettings = ["instants", "recentClips"];

const sources = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.*", "!./**/*.stories.*"], {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

function persistedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const match of text.matchAll(/createPersistedState<[^>]*>\("([^"]+)"\)/g)) keys.add(match[1]);
  }
  return keys;
}

describe("stored keys", () => {
  it("finds the persisted keys", () => {
    expect(persistedKeys().size).toBeGreaterThan(notSettings.length);
  });

  it("decides for every persisted key whether Restaurar resets it", () => {
    const undecided = [...persistedKeys()].filter(
      key => !(settingsKeys as readonly string[]).includes(key) && !notSettings.includes(key)
    );
    expect(undecided).toEqual([]);
  });

  it("never resets the favourites", () => {
    expect(settingsKeys).not.toContain("instants");
  });
});
