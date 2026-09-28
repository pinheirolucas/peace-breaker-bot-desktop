import { describe, expect, it } from "vitest";
import type { Instant } from "../storage";
import { emptySync, serverSync, switchOwner, withServerSync } from "./favoritesSync";

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
