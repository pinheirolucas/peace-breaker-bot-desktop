import type { Server } from "../../electron/discovery";

/** A server added by address: it has no hostname or address of its own, and is never "this computer". */
export function manualServerFor(apiUrl: string): Server {
  return {
    id: apiUrl,
    apiUrl,
    address: null,
    port: Number(new URL(apiUrl).port) || (apiUrl.startsWith("https:") ? 443 : 80),
    hostname: null,
    isLocal: false,
    manual: true
  };
}

/** The list with `apiUrl` added, or the same list when it is already there. */
export function withManualServer(list: Server[], apiUrl: string): Server[] {
  return list.some((server) => server.apiUrl === apiUrl) ? list : [...list, manualServerFor(apiUrl)];
}
