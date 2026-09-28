import type { Instant } from "../storage";

/** The last list one bot and this client agreed on. */
export interface ServerSync {
  revision: number;
  base: Instant[];
  /** When the bot last saved the list, as it reported it. */
  updatedAt?: string;
}

export interface OwnerFavorites {
  /** This owner's list while another owner is current; "instants" holds the current one. */
  list: Instant[];
  /** By apiUrl. */
  servers: Record<string, ServerSync>;
}

/** What the main window last saw of the selected bot, for Configurações. */
export type SyncStatus =
  | { apiUrl: string; state: "synced" | "offline" | "unsupported" }
  | { apiUrl: string; state: "stopped"; label: string | null; message: string };

export interface FavoritesSync {
  /** Whose list "instants" holds. Null until the first bot answers. */
  currentOwner: string | null;
  owners: Record<string, OwnerFavorites>;
  status?: SyncStatus;
}

export const emptySync: FavoritesSync = { currentOwner: null, owners: {} };

/**
 * Makes `owner` current. The first owner ever seen adopts the list already on
 * screen; after that, the outgoing owner's list is put away and the incoming
 * one's comes back, empty if never seen.
 */
export function switchOwner(
  sync: FavoritesSync,
  instants: Instant[],
  owner: string
): { sync: FavoritesSync; instants: Instant[] } {
  if (sync.currentOwner === owner) return { sync, instants };

  const owners = { ...sync.owners };
  if (sync.currentOwner === null) {
    owners[owner] = { ...(owners[owner] ?? { servers: {} }), list: instants };
    return { sync: { ...sync, currentOwner: owner, owners }, instants };
  }

  const outgoing = owners[sync.currentOwner] ?? { list: [], servers: {} };
  owners[sync.currentOwner] = { ...outgoing, list: instants };
  const incoming = owners[owner] ?? { list: [], servers: {} };
  owners[owner] = incoming;

  return { sync: { ...sync, currentOwner: owner, owners }, instants: incoming.list };
}

/** The current owner's record of one bot, if they have synced before. */
export function serverSync(sync: FavoritesSync, apiUrl: string): ServerSync | undefined {
  return sync.currentOwner === null ? undefined : sync.owners[sync.currentOwner]?.servers[apiUrl];
}

/** Records what the current owner and one bot now agree on. */
export function withServerSync(sync: FavoritesSync, apiUrl: string, entry: ServerSync | null): FavoritesSync {
  const owner = sync.currentOwner;
  if (owner === null) return sync;

  const record = sync.owners[owner] ?? { list: [], servers: {} };
  const servers = { ...record.servers };
  if (entry) servers[apiUrl] = entry;
  else delete servers[apiUrl];

  return { ...sync, owners: { ...sync.owners, [owner]: { ...record, servers } } };
}
