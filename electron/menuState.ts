// The native menus' shared vocabulary: channel names, the state the renderer
// feeds the main process, and the commands that come back. Pure, and inlined
// into the sandboxed preload like chrome.ts and shortcuts.ts. The renderer is
// untrusted, so everything that crosses into main goes through a validator
// here first; the builders in menuTemplates.ts only ever see what passed.

import { modifiersFor } from "./shortcuts";
import type { GlobalModifier } from "./shortcuts";

// renderer -> main
export const menuStateChannel = "menu:state";
export const cardContextChannel = "menu:card";
export const gridContextChannel = "menu:grid";
export const serverContextChannel = "menu:server";
export const serverRowContextChannel = "menu:server-row";
export const selectionContextChannel = "menu:selection";
// main -> renderer
export const menuCommandChannel = "menu:command";

export type MenuLanguage = "pt-BR" | "en-US";
export type MenuTab = "favorites" | "explore";
export type MenuPlaying = "local" | "discord" | null;
export type Surface = "favorites" | "explore";

const maxText = 300;
const maxServers = 64;
const maxProviders = 16;
const maxRegions = 64;

export interface MenuServer {
  id: string;
  address: string;
  isLocal: boolean;
  manual: boolean;
  active: boolean;
}

export interface MenuState {
  tab: MenuTab;
  /** What is playing on either tab, for Parar reprodução. */
  playing: MenuPlaying;
  /** null is unknown and is never read as false. */
  botConnected: boolean | null;
  /** "Servidor · #canal", only when the bot is in a channel and its names are known. */
  botChannel: string | null;
  /** Whether the active server has answered; a silent one shows no bot line. */
  healthy: boolean;
  organizing: boolean;
  hasFavorites: boolean;
  /** A search is set; the search field's menu offers to clear it. */
  hasQuery: boolean;
  /** Why Organizar is unavailable right now, the same rule Adicionar's menu applies. */
  organizeBlocked: "playing" | "search" | null;
  /** A card holds keyboard focus, which Tocar/Enviar no cartão em foco act on. */
  focusedCard: boolean;
  /** A dialog or Aparência is open: window commands wait. */
  blocked: boolean;
  language: MenuLanguage;
  activeAddress: string | null;
  activeIsLocal: boolean;
  servers: MenuServer[];
  /** null: the registry is unknown, so the Site section is left out. */
  providers: { key: string; name: string }[] | null;
  provider: string | null;
  regionSupported: boolean;
  region: string;
  regions: { code: string; label: string }[];
  /** Site and region are both on their defaults. */
  filtersDefault: boolean;
  globalKeys: {
    available: boolean;
    enabled: boolean;
    modifier: GlobalModifier | null;
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isText(x: unknown, max = maxText): x is string {
  return typeof x === "string" && x.length <= max;
}

function isNullableText(x: unknown): x is string | null {
  return x === null || isText(x);
}

function isBoolean(x: unknown): x is boolean {
  return typeof x === "boolean";
}

export function isLanguage(x: unknown): x is MenuLanguage {
  return x === "pt-BR" || x === "en-US";
}

const regionPattern = /^[a-z]{2}$/;

function isServer(x: unknown): x is MenuServer {
  return (
    isObject(x) &&
    isText(x.id, 2048) &&
    isText(x.address) &&
    isBoolean(x.isLocal) &&
    isBoolean(x.manual) &&
    isBoolean(x.active)
  );
}

export function isMenuState(x: unknown, platform: string): x is MenuState {
  if (!isObject(x)) return false;

  const { providers, servers, regions, globalKeys } = x;

  if (x.tab !== "favorites" && x.tab !== "explore") return false;
  if (x.playing !== null && x.playing !== "local" && x.playing !== "discord") return false;
  if (x.botConnected !== null && !isBoolean(x.botConnected)) return false;
  if (!isNullableText(x.botChannel)) return false;
  if (x.organizeBlocked !== null && x.organizeBlocked !== "playing" && x.organizeBlocked !== "search") {
    return false;
  }

  const flags = [
    x.healthy,
    x.organizing,
    x.hasFavorites,
    x.hasQuery,
    x.focusedCard,
    x.blocked,
    x.activeIsLocal,
    x.regionSupported,
    x.filtersDefault
  ];
  if (!flags.every(isBoolean)) return false;

  if (!isLanguage(x.language)) return false;
  if (!isNullableText(x.activeAddress)) return false;
  if (!Array.isArray(servers) || servers.length > maxServers || !servers.every(isServer)) return false;

  if (providers !== null) {
    if (
      !Array.isArray(providers) ||
      providers.length > maxProviders ||
      !providers.every((p) => isObject(p) && isText(p.key, 64) && isText(p.name, 64))
    ) {
      return false;
    }
  }

  if (!isNullableText(x.provider) || !isText(x.region, 2) || !regionPattern.test(x.region)) return false;

  if (
    !Array.isArray(regions) ||
    regions.length > maxRegions ||
    !regions.every((r) => isObject(r) && isText(r.code, 2) && regionPattern.test(r.code) && isText(r.label, 64))
  ) {
    return false;
  }

  if (!isObject(globalKeys)) return false;
  if (!isBoolean(globalKeys.available) || !isBoolean(globalKeys.enabled)) return false;

  return (
    globalKeys.modifier === null ||
    modifiersFor(platform).includes(globalKeys.modifier as GlobalModifier)
  );
}

/** What a card knows that main cannot: the flags are cardState's own output, so a menu can never offer what the card's buttons refuse. */
export interface CardContext {
  surface: Surface;
  url: string;
  name: string;
  playback: "idle" | "local" | "discord";
  state: {
    playDisabled: boolean;
    discordDisabled: boolean;
    botGated: boolean;
    stopDisabled: boolean;
    trailDisabled: boolean;
  };
  /** The favourite's key, shown on the rows it triggers. */
  key: string | null;
  organizing: boolean;
  /** Explorar: this clip is already a favourite. */
  favorite: boolean;
  providerName: string;
  /** 0-based, for Mover para o início/o fim in Organizar. */
  index: number;
  total: number;
  /** The card's rendered width, handed back with Renomear… for its preview. */
  width: number;
}

export function isCardContext(x: unknown): x is CardContext {
  if (!isObject(x)) return false;

  const { state } = x;
  if (x.surface !== "favorites" && x.surface !== "explore") return false;
  if (!isText(x.url, 2048) || !isText(x.name) || !isText(x.providerName, 64)) return false;
  if (x.playback !== "idle" && x.playback !== "local" && x.playback !== "discord") return false;
  if (!(x.key === null || (isText(x.key, 1) && /^[a-z0-9]$/.test(x.key)))) return false;
  if (!isBoolean(x.organizing) || !isBoolean(x.favorite)) return false;

  if (
    typeof x.index !== "number" ||
    typeof x.total !== "number" ||
    typeof x.width !== "number" ||
    !Number.isInteger(x.index) ||
    !Number.isInteger(x.total) ||
    x.index < 0 ||
    x.total < 1 ||
    x.index >= x.total ||
    x.width < 0 ||
    !Number.isFinite(x.width)
  ) {
    return false;
  }

  return (
    isObject(state) &&
    [state.playDisabled, state.discordDisabled, state.botGated, state.stopDisabled, state.trailDisabled].every(
      isBoolean
    )
  );
}

export interface ServerRowContext {
  id: string;
}

export function isServerRowContext(x: unknown): x is ServerRowContext {
  return isObject(x) && isText(x.id, 2048);
}

export type CardAction =
  | "play"
  | "discord"
  | "stop"
  | "rename"
  | "set-key"
  | "move-start"
  | "move-end"
  | "remove"
  | "toggle-favorite";

const cardActions: readonly string[] = [
  "play",
  "discord",
  "stop",
  "rename",
  "set-key",
  "move-start",
  "move-end",
  "remove",
  "toggle-favorite"
];

/** Everything main can ask the renderer to do. Data only: the renderer runs the same handler the button runs. */
export type MenuCommand =
  | { type: "tab"; tab: MenuTab }
  | { type: "find" }
  | { type: "add" }
  | { type: "add-server" }
  | { type: "import" }
  | { type: "export" }
  | { type: "organize" }
  | { type: "reload" }
  | { type: "stop" }
  | { type: "play-focused" }
  | { type: "send-focused" }
  | { type: "appearance" }
  | { type: "shortcuts" }
  | { type: "language"; language: MenuLanguage }
  | { type: "provider"; key: string }
  | { type: "region"; region: string }
  | { type: "reset-filters" }
  | { type: "clear-search" }
  | { type: "server-select"; id: string }
  | { type: "server-test"; id: string }
  | { type: "server-remove"; id: string }
  | { type: "server-refresh" }
  | { type: "global-enabled"; enabled: boolean }
  | { type: "global-modifier"; modifier: GlobalModifier }
  | { type: "card"; surface: Surface; action: CardAction; url: string; width: number };

const simpleCommands: readonly string[] = [
  "find",
  "add",
  "add-server",
  "import",
  "export",
  "organize",
  "reload",
  "stop",
  "play-focused",
  "send-focused",
  "appearance",
  "shortcuts",
  "reset-filters",
  "clear-search",
  "server-refresh"
];

export function isMenuCommand(x: unknown): x is MenuCommand {
  if (!isObject(x) || typeof x.type !== "string") return false;

  if (simpleCommands.includes(x.type)) return true;

  switch (x.type) {
    case "tab":
      return x.tab === "favorites" || x.tab === "explore";
    case "language":
      return isLanguage(x.language);
    case "provider":
      return isText(x.key, 64);
    case "region":
      return isText(x.region, 2) && regionPattern.test(x.region);
    case "server-select":
    case "server-test":
    case "server-remove":
      return isText(x.id, 2048);
    case "global-enabled":
      return isBoolean(x.enabled);
    case "global-modifier":
      return typeof x.modifier === "string";
    case "card":
      return (
        (x.surface === "favorites" || x.surface === "explore") &&
        typeof x.action === "string" &&
        cardActions.includes(x.action) &&
        isText(x.url, 2048) &&
        typeof x.width === "number"
      );
    default:
      return false;
  }
}

/** The url when it is https and nothing else: what openExternal may be given. */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "" ? url.toString() : null;
  } catch {
    return null;
  }
}
