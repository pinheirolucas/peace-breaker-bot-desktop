// Pure URL/record building for mDNS discovery. Kept free of electron and
// bonjour imports so it can be unit-tested directly (src/discovery.test.js)
// and so the preload — which is sandboxed and cannot require a sibling
// module at runtime — can have it inlined at build time instead.

export const discoveryServersChannel = "discovery:servers";
export const discoveryRefreshChannel = "discovery:refresh";
export const discoveryType = "myinstants";
export const discoveryProtocol = "tcp";
export const discoveryApiVersion = "1";
export const discoveryQueryInterval = 30000;

/** The subset of bonjour-service's Service that is actually trustworthy.
 *  `name`, `type` and `host` are deliberately absent: the advertised
 *  instance name embeds a dot (macOS os.Hostname() already ends in
 *  ".local"), which makes bonjour-service mis-split the fqdn — `type`
 *  comes back as "local-9001" and `host` doubles its suffix. */
export interface DiscoveredService {
  fqdn?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, string>;
}

export interface Server {
  id: string;
  apiUrl: string;
  address: string | null;
  port: number;
  hostname: string | null;
  isLocal: boolean;
  manual?: true;
}

const fqdnSuffix = `._${discoveryType}._${discoveryProtocol}.local`;

function isLinkLocalIPv4(address: string): boolean {
  return address.startsWith("169.254.");
}

function isLinkLocalIPv6(address: string): boolean {
  return /^fe[89ab]/i.test(address);
}

export function pickAddress(service?: DiscoveredService | null): string | null {
  const addresses = service?.addresses || [];

  const ipv4 = addresses.find(
    (address) => address.includes(".") && !isLinkLocalIPv4(address)
  );

  if (ipv4) {
    return ipv4;
  }

  const ipv6 = addresses.find(
    (address) => !address.includes(".") && !isLinkLocalIPv6(address)
  );

  return ipv6 || null;
}

function formatAddress(address: string | null): string | null {
  if (!address) {
    return null;
  }

  return address.includes(".") ? address : `[${address}]`;
}

export function pickHost(service?: DiscoveredService | null): string | null {
  return formatAddress(pickAddress(service));
}

export function hostnameFromService(service?: DiscoveredService | null): string | null {
  const fqdn = service?.fqdn || "";

  const instance = fqdn.endsWith(fqdnSuffix)
    ? fqdn.slice(0, -fqdnSuffix.length)
    : "";

  const withoutPort = instance.replace(/-\d+$/, "");
  const withoutDomain = withoutPort.replace(/\.local$/i, "");

  return withoutDomain || null;
}

const apiVersionPath = "/v1";

export function buildApiUrl(service?: DiscoveredService | null): string | null {
  if (!service || !Number.isInteger(service.port) || (service.port as number) <= 0) {
    return null;
  }

  const txt = service.txt || {};

  if (txt.api !== discoveryApiVersion) {
    return null;
  }

  const host = pickHost(service);

  if (!host) {
    return null;
  }

  const basePath = String(txt.path || "/").replace(/\/+$/, "");

  return `http://${host}:${service.port}${basePath}${apiVersionPath}`;
}

export function buildServer(
  service: DiscoveredService,
  localAddresses?: Set<string>
): Server | null {
  const apiUrl = buildApiUrl(service);

  if (!apiUrl) {
    return null;
  }

  const address = pickAddress(service);
  const known = localAddresses instanceof Set ? localAddresses : new Set<string>();

  return {
    id: service.fqdn || apiUrl,
    apiUrl,
    address,
    port: service.port as number,
    hostname: hostnameFromService(service),
    isLocal: address !== null && known.has(address)
  };
}

export function sortServers(servers: Server[]): Server[] {
  return servers.slice().sort((a, b) => {
    if (a.isLocal !== b.isLocal) {
      return a.isLocal ? -1 : 1;
    }

    if (a.port !== b.port) {
      return a.port - b.port;
    }

    return String(a.address).localeCompare(String(b.address));
  });
}
