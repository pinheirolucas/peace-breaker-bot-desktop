import type { Instant } from "../storage";
import { mergeImported, sanitizeKeys } from "./clipKeys";

/** Same clips, names, keys and order. */
export function sameFavorites(a: readonly Instant[], b: readonly Instant[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index];
      return item.url === other.url && item.name === other.name && (item.key ?? null) === (other.key ?? null);
    })
  );
}

function byUrl(list: readonly Instant[]): Map<string, Instant> {
  return new Map(list.map((item) => [item.url, item]));
}

function edited(before: Instant, after: Instant): boolean {
  return before.name !== after.name || (before.key ?? null) !== (after.key ?? null);
}

/** How many clips were added, removed or edited from `base` to `list`; a reorder alone counts as one. */
export function countChanges(base: readonly Instant[], list: readonly Instant[]): number {
  const before = byUrl(base);
  const after = byUrl(list);
  let count = 0;

  for (const [url, item] of after) {
    const old = before.get(url);
    if (!old || edited(old, item)) count++;
  }
  for (const url of before.keys()) {
    if (!after.has(url)) count++;
  }

  return count === 0 && !sameFavorites(base, list) ? 1 : count;
}

function reordered(base: readonly Instant[], side: readonly Instant[]): boolean {
  const kept = byUrl(side);
  const from = base.filter(({ url }) => kept.has(url)).map(({ url }) => url);
  const shared = new Set(from);
  const to = side.filter(({ url }) => shared.has(url)).map(({ url }) => url);
  return from.some((url, index) => url !== to[index]);
}

function pick<K extends "name" | "key">(field: K, base: Instant, local: Instant, remote: Instant): Instant[K] {
  return local[field] !== base[field] && remote[field] === base[field] ? local[field] : remote[field];
}

/** Lays out `order`, then slots in the rest of `other` right after the neighbour it follows there. */
function arrange(order: readonly Instant[], other: readonly Instant[], kept: Map<string, Instant>): Instant[] {
  const urls = order.filter(({ url }) => kept.has(url)).map(({ url }) => url);
  const placed = new Set(urls);
  let anchor: string | null = null;

  for (const { url } of other) {
    if (!kept.has(url)) continue;
    if (!placed.has(url)) {
      urls.splice(anchor === null ? 0 : urls.indexOf(anchor) + 1, 0, url);
      placed.add(url);
    }
    anchor = url;
  }

  return urls.map((url) => kept.get(url)!);
}

/**
 * Three-way merge by url of this client's list and a bot's, from the last
 * list the two agreed on. Adds on either side stay, a remove beats an
 * untouched clip, a rename beats a remove, and when both sides changed the
 * same field the bot's wins.
 */
export function mergeFavorites(base: readonly Instant[], local: readonly Instant[], remote: readonly Instant[]): Instant[] {
  const b = byUrl(base);
  const l = byUrl(local);
  const r = byUrl(remote);
  const kept = new Map<string, Instant>();

  for (const url of new Set([...l.keys(), ...r.keys()])) {
    const was = b.get(url);
    const mine = l.get(url);
    const theirs = r.get(url);

    if (!was) {
      kept.set(url, theirs ?? mine!);
    } else if (mine && theirs) {
      const name = pick("name", was, mine, theirs);
      const key = pick("key", was, mine, theirs);
      kept.set(url, key === undefined ? { name, url } : { name, url, key });
    } else if (mine && mine.name !== was.name) {
      kept.set(url, mine);
    } else if (theirs && theirs.name !== was.name) {
      kept.set(url, theirs);
    }
  }

  const localFirst = reordered(base, local) && !reordered(base, remote);
  const merged = localFirst ? arrange(local, remote, kept) : arrange(remote, local, kept);

  const fromRemote = (item: Instant) => item.key !== undefined && r.get(item.url)?.key === item.key;
  const remoteKeyed = sanitizeKeys(merged.filter(fromRemote));
  const taken = remoteKeyed.flatMap(({ key }) => (key ? [key] : []));
  const rest = byUrl(sanitizeKeys(merged.filter((item) => !fromRemote(item)), taken));
  const settled = byUrl(remoteKeyed);

  return merged.map(({ url }) => settled.get(url) ?? rest.get(url)!);
}

/** The list to keep the first time this client meets a bot: whichever side has clips, or both merged with the bot's name and key winning. */
export function firstSyncFavorites(local: readonly Instant[], remote: readonly Instant[]): Instant[] {
  if (remote.length === 0) return [...local];
  if (local.length === 0) return [...remote];
  return mergeImported([...remote], [...local]);
}
