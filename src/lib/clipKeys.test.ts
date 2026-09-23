import { describe, expect, it } from "vitest";
import { assignKey, clipKeyFromEvent, mergeImported, sanitizeKeys } from "./clipKeys";

const a = { name: "A", url: "https://x.test/a", key: "v" };
const b = { name: "B", url: "https://x.test/b" };
const c = { name: "C", url: "https://x.test/c", key: "1" };

describe("clipKeyFromEvent", () => {
  it("lower-cases the printed key", () => {
    expect(clipKeyFromEvent({ key: "V" })).toBe("v");
    expect(clipKeyFromEvent({ key: "7" })).toBe("7");
  });

  it("refuses punctuation, space, Ç and named keys", () => {
    for (const key of ["?", " ", "ç", "Enter", "ArrowUp", "F1"]) {
      expect(clipKeyFromEvent({ key })).toBeNull();
    }
  });

  it("falls back to the digit row's code when Shift turns 1 into !", () => {
    expect(clipKeyFromEvent({ key: "!", code: "Digit1", shiftKey: true })).toBe("1");
    expect(clipKeyFromEvent({ key: "!", code: "Digit1", shiftKey: false })).toBeNull();
  });
});

describe("assignKey", () => {
  it("gives a sound a key", () => {
    const { instants, displaced } = assignKey([a, b], b.url, "x");
    expect(instants[1].key).toBe("x");
    expect(displaced).toBeNull();
  });

  it("moves a key from the sound that had it", () => {
    const { instants, displaced } = assignKey([a, b], b.url, "v");
    expect(instants[0].key).toBeUndefined();
    expect(instants[1].key).toBe("v");
    expect(displaced?.url).toBe(a.url);
  });

  it("replaces a sound's own key, and clears it with null", () => {
    expect(assignKey([a], a.url, "z").instants[0].key).toBe("z");
    expect("key" in assignKey([a], a.url, null).instants[0]).toBe(false);
  });
});

describe("importing", () => {
  it("drops an imported key that collides with a stored one", () => {
    const merged = mergeImported([a], [{ name: "D", url: "https://x.test/d", key: "v" }, c]);
    expect(merged.map((item) => item.key)).toEqual(["v", undefined, "1"]);
  });

  it("lets the stored favourite win for the same url", () => {
    const merged = mergeImported([b], [{ ...b, name: "Other", key: "q" }]);
    expect(merged).toEqual([b]);
  });

  it("drops invalid and repeated keys from a replacing file", () => {
    const cleaned = sanitizeKeys([
      { name: "1", url: "u1", key: "v" },
      { name: "2", url: "u2", key: "v" },
      { name: "3", url: "u3", key: "ç" }
    ]);
    expect(cleaned.map((item) => item.key)).toEqual(["v", undefined, undefined]);
  });
});
