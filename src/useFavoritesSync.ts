import { useEffect, useRef } from "react";
import { sanitizeKeys } from "./lib/clipKeys";
import { firstSyncFavorites, mergeFavorites, sameFavorites } from "./lib/favoritesMerge";
import { emptySync, serverSync, switchOwner, withServerSync } from "./lib/favoritesSync";
import type { FavoritesSync, ServerSync, SyncStatus } from "./lib/favoritesSync";
import { ApiError, getFavorites, putFavorites } from "./service";
import type { Favorites } from "./service";
import { useFavoritesSyncState, useInstantsState } from "./storage";
import type { Instant } from "./storage";

const PULL_MS = 15000;
const PUSH_DELAY_MS = 500;
const MAX_TRIES = 3;

/** Labels that mean this list will never be accepted as it is. */
const refusals = new Set(["invalid_favorites", "favorites_too_large"]);

function record(remote: Favorites): ServerSync {
  return remote.updatedAt === undefined
    ? { revision: remote.revision, base: remote.instants }
    : { revision: remote.revision, base: remote.instants, updatedAt: remote.updatedAt };
}

function sameStatus(a: SyncStatus | undefined, b: SyncStatus): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function statusFor(apiUrl: string, err: unknown): SyncStatus {
  if (err instanceof ApiError && err.status === 404 && err.label === null) return { apiUrl, state: "unsupported" };
  if (err instanceof ApiError && err.status === null) return { apiUrl, state: "offline" };
  return {
    apiUrl,
    state: "stopped",
    label: err instanceof ApiError ? err.label : null,
    message: err instanceof Error ? err.message : String(err)
  };
}

/**
 * Keeps "instants" in step with the selected bot's copy of its owner's list.
 * Main window only. Pulls again when `healthy` comes back. `onMerged` hears
 * of a first sync that merged two lists.
 */
export function useFavoritesSync(apiUrl: string | null, healthy: boolean, onMerged?: (apiUrl: string) => void): void {
  const [instants, setInstants] = useInstantsState([]);
  const [sync, setSync] = useFavoritesSyncState(emptySync);

  const latest = useRef({ instants, sync });
  latest.current.instants = instants;
  latest.current.sync = sync;
  const active = useRef(apiUrl);
  active.current = apiUrl;
  const merged = useRef(onMerged);
  merged.current = onMerged;

  // The last list each bot refused, which is not sent again until it changes.
  const refused = useRef(new Map<string, Instant[]>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pullQueued = useRef(false);
  const schedulePull = useRef<() => void>(() => {});

  function commit(next: { sync?: FavoritesSync; instants?: Instant[] }) {
    if (next.instants && !sameFavorites(next.instants, latest.current.instants)) {
      latest.current.instants = next.instants;
      setInstants(next.instants);
    }
    if (next.sync && next.sync !== latest.current.sync) {
      latest.current.sync = next.sync;
      setSync(next.sync);
    }
  }

  function withStatus(current: FavoritesSync, status: SyncStatus): FavoritesSync {
    return sameStatus(current.status, status) ? current : { ...current, status };
  }

  function stillRefused(url: string): boolean {
    const list = refused.current.get(url);
    return list !== undefined && sameFavorites(list, sanitizeKeys(latest.current.instants));
  }

  function adopt(url: string, remote: Favorites) {
    const switched = switchOwner(latest.current.sync, latest.current.instants, remote.owner);
    const entry = serverSync(switched.sync, url);
    let next = switched.instants;
    let mergedLists = false;

    // A bot whose revision went backwards lost its data: meet it again.
    if (!entry || remote.revision < entry.revision) {
      mergedLists = next.length > 0 && remote.instants.length > 0 && !sameFavorites(next, remote.instants);
      next = firstSyncFavorites(next, remote.instants);
    } else if (remote.revision !== entry.revision) {
      next = sameFavorites(sanitizeKeys(next), entry.base)
        ? remote.instants
        : mergeFavorites(entry.base, next, remote.instants);
    }

    let nextSync = switched.sync;
    if (!entry || entry.revision !== remote.revision) nextSync = withServerSync(nextSync, url, record(remote));
    if (!stillRefused(url)) nextSync = withStatus(nextSync, { apiUrl: url, state: "synced" });

    commit({ sync: nextSync, instants: next });
    if (mergedLists) merged.current?.(url);
  }

  function fail(url: string, err: unknown) {
    commit({ sync: withStatus(latest.current.sync, statusFor(url, err)) });
  }

  async function pull(url: string) {
    let remote: Favorites;
    try {
      remote = await getFavorites();
    } catch (err) {
      if (active.current === url) fail(url, err);
      return;
    }
    if (active.current === url) adopt(url, remote);
  }

  async function push(url: string) {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const owner = latest.current.sync.currentOwner;
      const entry = serverSync(latest.current.sync, url);
      const list = sanitizeKeys(latest.current.instants);
      if (owner === null || !entry || sameFavorites(list, entry.base) || stillRefused(url)) return;

      try {
        const saved = await putFavorites(owner, entry.revision, list);
        if (active.current !== url) return;
        refused.current.delete(url);
        const next = withServerSync(latest.current.sync, url, record(saved));
        commit({ sync: withStatus(next, { apiUrl: url, state: "synced" }) });
        return;
      } catch (err) {
        if (active.current !== url) return;
        const label = err instanceof ApiError ? err.label : null;

        if (label === "favorites_conflict") {
          await pull(url);
          continue;
        }
        if (label === "owner_mismatch") {
          await pull(url);
          return;
        }
        if (label !== null && refusals.has(label)) refused.current.set(url, list);
        fail(url, err);
        return;
      }
    }
  }

  function run(task: () => Promise<void>) {
    queue.current = queue.current.then(task).catch(() => {});
  }

  useEffect(() => {
    if (!apiUrl) return undefined;

    function pullSoon() {
      if (pullQueued.current) return;
      pullQueued.current = true;
      run(async () => {
        try {
          await pull(apiUrl!);
        } finally {
          pullQueued.current = false;
        }
      });
    }

    schedulePull.current = pullSoon;
    pullSoon();
    const id = setInterval(pullSoon, PULL_MS);
    window.addEventListener("focus", pullSoon);

    return () => {
      schedulePull.current = () => {};
      clearInterval(id);
      window.removeEventListener("focus", pullSoon);
    };
    // pull reads everything else through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const wasHealthy = useRef(healthy);
  useEffect(() => {
    if (healthy && !wasHealthy.current) schedulePull.current();
    wasHealthy.current = healthy;
  }, [healthy]);

  useEffect(() => {
    if (!apiUrl) return undefined;
    const entry = serverSync(sync, apiUrl);
    if (!entry || sameFavorites(sanitizeKeys(instants), entry.base)) return undefined;

    const id = setTimeout(() => run(() => push(apiUrl)), PUSH_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, instants, sync]);
}
