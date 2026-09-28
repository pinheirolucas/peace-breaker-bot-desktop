import { describe, expect, it } from "vitest";
import type { Instant } from "../storage";
import { describeSync, emptySync, serverSync, switchOwner, withServerSync } from "./favoritesSync";
import type { FavoritesSync } from "./favoritesSync";

const a: Instant = { name: "A", url: "https://x.test/a.mp3" };
const b: Instant = { name: "B", url: "https://x.test/b.mp3" };
const home = "http://10.0.0.2:9001/api/v1";

describe("switchOwner", () => {
  it("gives the first owner the list already on screen", () => {
    const { sync, instants } = switchOwner(emptySync, [a], "lucas");
    expect(instants).toEqual([a]);
    expect(sync).toEqual({ currentOwner: "lucas", owners: { lucas: { list: [a], servers: {} } } });
  });

  it("puts the outgoing list away and starts a new owner empty", () => {
    const first = switchOwner(emptySync, [a], "lucas").sync;
    const { sync, instants } = switchOwner(first, [a, b], "maria");
    expect(instants).toEqual([]);
    expect(sync.currentOwner).toBe("maria");
    expect(sync.owners.lucas.list).toEqual([a, b]);
  });

  it("brings an owner's list back", () => {
    let state = switchOwner(emptySync, [a], "lucas");
    state = switchOwner(state.sync, state.instants, "maria");
    state = switchOwner(state.sync, [b], "lucas");
    expect(state.instants).toEqual([a]);
    expect(state.sync.owners.maria.list).toEqual([b]);
  });

  it("changes nothing for the current owner", () => {
    const { sync } = switchOwner(emptySync, [a], "lucas");
    expect(switchOwner(sync, [b], "lucas")).toEqual({ sync, instants: [b] });
  });

  it("keeps what an owner seen before already knows about bots", () => {
    const known = { currentOwner: null, owners: { lucas: { list: [], servers: { [home]: { revision: 2, base: [a] } } } } };
    expect(switchOwner(known, [b], "lucas").sync.owners.lucas).toEqual({ list: [b], servers: { [home]: { revision: 2, base: [a] } } });
  });
});

describe("server records", () => {
  it("records, reads and forgets a bot for the current owner only", () => {
    const { sync } = switchOwner(emptySync, [], "lucas");
    const withHome = withServerSync(sync, home, { revision: 1, base: [a] });
    expect(serverSync(withHome, home)).toEqual({ revision: 1, base: [a] });
    expect(serverSync(switchOwner(withHome, [], "maria").sync, home)).toBeUndefined();
    expect(serverSync(withServerSync(withHome, home, null), home)).toBeUndefined();
  });

  it("records nothing before an owner is known", () => {
    expect(withServerSync(emptySync, home, { revision: 1, base: [] })).toBe(emptySync);
  });
});

describe("describeSync", () => {
  const synced: FavoritesSync = {
    currentOwner: "lucas",
    owners: { lucas: { list: [], servers: { [home]: { revision: 3, base: [a], updatedAt: "2026-09-27T14:03:11Z" } } } },
    status: { apiUrl: home, state: "synced" }
  };

  it("says nothing without a server, or before the bot has answered", () => {
    expect(describeSync(synced, [a], null)).toBeNull();
    expect(describeSync(emptySync, [a], home)).toBeNull();
  });

  it("names the owner and the bot when in step", () => {
    expect(describeSync(synced, [a], home)).toEqual({ state: "synced", owner: "lucas", apiUrl: home, updatedAt: "2026-09-27T14:03:11Z" });
  });

  it("counts the changes waiting, and whether the bot is offline", () => {
    expect(describeSync(synced, [a, b], home)).toEqual({ state: "waiting", count: 1, apiUrl: home, offline: false });
    const offline: FavoritesSync = { ...synced, status: { apiUrl: home, state: "offline" } };
    expect(describeSync(offline, [], home)).toEqual({ state: "waiting", count: 1, apiUrl: home, offline: true });
  });

  it("says an old bot can't sync", () => {
    expect(describeSync({ ...emptySync, status: { apiUrl: home, state: "unsupported" } }, [a], home)).toEqual({ state: "unsupported", apiUrl: home });
  });

  it("passes on why the bot refused", () => {
    const stopped: FavoritesSync = { ...synced, status: { apiUrl: home, state: "stopped", label: "invalid_favorites", message: "bad" } };
    expect(describeSync(stopped, [a, b], home)).toEqual({ state: "stopped", label: "invalid_favorites", message: "bad" });
  });

  it("ignores a status about another bot", () => {
    const other: FavoritesSync = { ...synced, status: { apiUrl: "http://10.0.0.9:9001/api/v1", state: "unsupported" } };
    expect(describeSync(other, [a], home)?.state).toBe("synced");
  });
});
