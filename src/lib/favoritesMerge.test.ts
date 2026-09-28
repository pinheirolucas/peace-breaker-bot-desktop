import { describe, expect, it } from "vitest";
import type { Instant } from "../storage";
import { countChanges, firstSyncFavorites, mergeFavorites, sameFavorites } from "./favoritesMerge";

const clip = (id: string, name = id.toUpperCase(), key?: string): Instant =>
  key === undefined ? { name, url: `https://x.test/${id}.mp3` } : { name, url: `https://x.test/${id}.mp3`, key };

const a = clip("a");
const b = clip("b");
const c = clip("c");
const d = clip("d");
const names = (list: Instant[]) => list.map(({ name }) => name);

describe("sameFavorites", () => {
  it("compares order, names and keys", () => {
    expect(sameFavorites([a, b], [a, b])).toBe(true);
    expect(sameFavorites([a, b], [b, a])).toBe(false);
    expect(sameFavorites([a], [clip("a", "Other")])).toBe(false);
    expect(sameFavorites([a], [clip("a", "A", "x")])).toBe(false);
  });

  it("treats an absent key and an undefined one alike", () => {
    expect(sameFavorites([a], [{ ...a, key: undefined }])).toBe(true);
  });
});

describe("countChanges", () => {
  it("counts adds, removes and edits", () => {
    expect(countChanges([a, b], [a, clip("b", "Bee"), c])).toBe(2);
    expect(countChanges([a, b], [b])).toBe(1);
  });

  it("counts a reorder alone as one", () => {
    expect(countChanges([a, b, c], [c, b, a])).toBe(1);
  });

  it("is zero for the same list", () => {
    expect(countChanges([a, b], [a, b])).toBe(0);
  });
});

describe("mergeFavorites", () => {
  it("keeps an add from either side", () => {
    expect(mergeFavorites([a], [a, b], [a, c])).toEqual([a, b, c]);
  });

  it("takes the same add once, the bot's name winning", () => {
    expect(mergeFavorites([a], [a, clip("b", "Mine")], [a, clip("b", "Theirs")])).toEqual([a, clip("b", "Theirs")]);
  });

  it("lets a remove on either side beat an untouched clip", () => {
    expect(mergeFavorites([a, b, c], [a, c], [a, b, c])).toEqual([a, c]);
    expect(mergeFavorites([a, b, c], [a, b, c], [a, b])).toEqual([a, b]);
  });

  it("drops a clip both sides removed", () => {
    expect(mergeFavorites([a, b], [a], [a])).toEqual([a]);
  });

  it("lets a rename beat a remove, on either side", () => {
    expect(mergeFavorites([a, b], [a, clip("b", "Bee")], [a])).toEqual([a, clip("b", "Bee")]);
    expect(mergeFavorites([a, b], [a], [a, clip("b", "Bee")])).toEqual([a, clip("b", "Bee")]);
  });

  it("lets a remove beat a key change", () => {
    expect(mergeFavorites([a, b], [a, clip("b", "B", "k")], [a])).toEqual([a]);
  });

  it("takes an edit from whichever side made it", () => {
    expect(mergeFavorites([a, b], [clip("a", "Local"), b], [a, clip("b", "Remote")])).toEqual([
      clip("a", "Local"),
      clip("b", "Remote")
    ]);
  });

  it("keeps a rename from one side and a key from the other", () => {
    expect(mergeFavorites([a], [clip("a", "Local")], [clip("a", "A", "q")])).toEqual([clip("a", "Local", "q")]);
  });

  it("lets the bot win when both sides changed the same field", () => {
    expect(mergeFavorites([a], [clip("a", "Local")], [clip("a", "Remote")])).toEqual([clip("a", "Remote")]);
    expect(mergeFavorites([a], [clip("a", "A", "l")], [clip("a", "A", "r")])).toEqual([clip("a", "A", "r")]);
  });

  it("keeps a key cleared on one side", () => {
    const keyed = clip("a", "A", "z");
    expect(mergeFavorites([keyed], [a], [keyed])).toEqual([a]);
  });

  it("uses the bot's order when both reordered", () => {
    expect(names(mergeFavorites([a, b, c], [c, a, b], [b, c, a]))).toEqual(["B", "C", "A"]);
  });

  it("uses the local order when only this client reordered", () => {
    expect(names(mergeFavorites([a, b, c], [c, b, a], [a, b, c, d]))).toEqual(["C", "D", "B", "A"]);
  });

  it("puts a local add after the clip it follows here", () => {
    expect(names(mergeFavorites([a, b, c], [a, d, b, c], [a, b, c]))).toEqual(["A", "D", "B", "C"]);
  });

  it("puts a local add at the top when it leads here", () => {
    expect(names(mergeFavorites([a, b], [d, a, b], [b, a]))).toEqual(["D", "B", "A"]);
  });

  it("gives a contested key to the bot's clip", () => {
    const merged = mergeFavorites([a, b], [clip("a", "A", "k"), b], [a, clip("b", "B", "k")]);
    expect(merged).toEqual([a, clip("b", "B", "k")]);
  });

  it("drops a local key that another clip now holds on the bot", () => {
    const merged = mergeFavorites([], [clip("c", "C", "k")], [clip("b", "B", "k")]);
    expect(merged).toEqual([c, clip("b", "B", "k")]);
  });

  it("carries adds and removes made on other bots as local changes", () => {
    // Bot two last agreed on [a, b]; since then this client, on bot one, added c and removed b.
    expect(mergeFavorites([a, b], [a, c], [a, b, d])).toEqual([a, c, d]);
  });

  it("is the remote list when local equals base", () => {
    expect(mergeFavorites([a, b], [a, b], [b, c])).toEqual([b, c]);
  });

  it("is the local list when remote equals base", () => {
    expect(mergeFavorites([a, b], [b, clip("c", "C", "c")], [a, b])).toEqual([b, clip("c", "C", "c")]);
  });
});

describe("firstSyncFavorites", () => {
  it("keeps the local list when the bot has none", () => {
    expect(firstSyncFavorites([a, b], [])).toEqual([a, b]);
  });

  it("takes the bot's list when there is no local one", () => {
    expect(firstSyncFavorites([], [a, b])).toEqual([a, b]);
  });

  it("merges both, the bot's clips first and its names and keys winning", () => {
    const merged = firstSyncFavorites([clip("a", "Mine", "k"), c], [clip("a", "Theirs"), clip("b", "B", "k")]);
    expect(merged).toEqual([clip("a", "Theirs"), clip("b", "B", "k"), c]);
  });
});
