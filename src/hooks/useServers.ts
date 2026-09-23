import { useEffect, useMemo, useState } from "react";
import { sortServers } from "../../electron/discovery";
import type { Server } from "../../electron/discovery";
import { getApiUrl, isHealthy, onHealthChange, resetApiUrl, setApiUrl } from "../service";
import { useManualServers, useSelectedServer } from "../storage";

/**
 * Which backend a window talks to, resolved the way App resolves it: an
 * explicit pick (re-validated, so a stale one falls through), then the first
 * discovered server — and with neither, nothing, never a default address.
 * Quick access's copy of that rule; discovery reaches it over the same
 * bridge, and the pick is shared with the window through storage.
 */
export function useServers() {
  const [discovered, setDiscovered] = useState<Server[]>([]);
  const [manual] = useManualServers([]);
  const [selected, setSelected] = useSelectedServer(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(getApiUrl());
  const [healthy, setHealthy] = useState<boolean>(isHealthy);

  const servers = useMemo(() => sortServers([...manual, ...discovered]), [manual, discovered]);

  useEffect(() => {
    const discovery = window.instantsDiscovery;
    if (!discovery || typeof discovery.onServers !== "function") return undefined;

    return discovery.onServers((next) => setDiscovered(Array.isArray(next) ? (next as Server[]) : []));
  }, []);

  useEffect(() => onHealthChange(setHealthy), []);

  useEffect(() => {
    if (!(selected && setApiUrl(selected))) {
      if (servers.length > 0) {
        setApiUrl(servers[0].apiUrl);
      } else {
        resetApiUrl();
      }
    }
    setActiveUrl(getApiUrl());
  }, [servers, selected]);

  return {
    servers,
    activeUrl,
    healthy,
    select: (server: Server) => setSelected(server.apiUrl),
    /** Picks a server by address — one just added has no Server yet. */
    selectUrl: (apiUrl: string) => setSelected(apiUrl),
    /** Forgets the pick: the first discovered server, or nothing, is in use again. */
    clearSelection: () => setSelected(null),
    refresh: () => window.instantsDiscovery?.refresh?.()
  };
}
