// The one record of what the app is doing, and how it is validated on the way
// in. Pure, and inlined into the sandboxed preload like chrome.ts: the main
// process owns a PresenceStore, every renderer reports into it over IPC, and
// every native surface (tray glyph, menus, quick access strip) is a view of it. The
// renderers are untrusted, so everything they send goes through a validator
// here first.

// renderer -> main
/** The address of the active server, or null for none. */
export const presenceServerChannel = "presence:server";
/** What this renderer is playing, or null. */
export const presencePlayingChannel = "presence:playing";
/** Stop whatever plays, from any surface. */
export const presenceStopChannel = "presence:stop";
// main -> renderer
/** The whole record, on every change. */
export const presenceSnapshotChannel = "presence:snapshot";

/** What GET /bot/status answers, as the renderer's own BotStatus type. */
export interface PresenceBot {
  connected: boolean;
  guildName?: string;
  channelName?: string;
}

export type PlayMode = "local" | "discord";

/** What a renderer reports: which path plays what. `since` is main's, not the renderer's. */
export interface PlayingReport {
  mode: PlayMode;
  name: string;
}

export interface Playing extends PlayingReport {
  since: number;
}

export interface PresenceSnapshot {
  /** null is unknown — loading, no server, or an old backend — and is never "not connected". */
  bot: PresenceBot | null;
  playing: Playing | null;
  server: string | null;
  /** The last poll got no response at all: the server is silent. Any answer at
   *  all, an error included, clears it — the same passive rule as the window's chip. */
  silent: boolean;
}

export const emptyPresence: PresenceSnapshot = { bot: null, playing: null, server: null, silent: false };

export type PresenceAction =
  | { type: "server"; server: string | null }
  | { type: "poll"; bot: PresenceBot | null; silent: boolean }
  | { type: "playing"; playing: Playing | null };

/**
 * A new server makes the bot status unknown again: what the last one said
 * about its voice channel says nothing about this one. Returns the same object
 * when nothing changed, so a subscriber can compare by reference.
 */
export function presenceReduce(state: PresenceSnapshot, action: PresenceAction): PresenceSnapshot {
  switch (action.type) {
    case "server":
      return action.server === state.server
        ? state
        : { ...state, server: action.server, bot: null, silent: false };
    case "poll":
      return sameBot(action.bot, state.bot) && action.silent === state.silent
        ? state
        : { ...state, bot: action.bot, silent: action.silent };
    case "playing":
      return samePlaying(action.playing, state.playing) ? state : { ...state, playing: action.playing };
  }
}

function sameBot(a: PresenceBot | null, b: PresenceBot | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.connected === b.connected && a.guildName === b.guildName && a.channelName === b.channelName
  );
}

function samePlaying(a: Playing | null, b: Playing | null): boolean {
  if (a === null || b === null) return a === b;
  return a.mode === b.mode && a.name === b.name && a.since === b.since;
}

/**
 * Several renderers report at once (the window and quick access); the record
 * shows the one that started last. `since` is stamped here, and kept while the
 * same clip keeps playing on the same path.
 */
export function mergePlaying(
  reports: Iterable<PlayingReport | null>,
  previous: Playing | null,
  now: number
): Playing | null {
  let latest: PlayingReport | null = null;
  const active: PlayingReport[] = [];

  for (const report of reports) {
    if (report) active.push(report);
  }

  // A report that is still what the record already says wins, so two windows
  // playing does not make the record flip between them.
  latest =
    active.find((report) => previous && report.mode === previous.mode && report.name === previous.name) ??
    active[active.length - 1] ??
    null;

  if (!latest) return null;
  if (previous && previous.mode === latest.mode && previous.name === latest.name) return previous;
  return { ...latest, since: now };
}

/** The four shapes the tray glyph takes. Shapes, not colours: a macOS template image has only alpha. */
export type TrayState = "connected" | "playing" | "idle" | "off";

/**
 * No server, or one that is silent, is off. Then playing; then what the bot says. An unknown status with a
 * server is "off", never "idle": unknown must not read as "not in a channel".
 */
export function trayState(snapshot: PresenceSnapshot): TrayState {
  if (snapshot.server === null || snapshot.silent) return "off";
  if (snapshot.playing) return "playing";
  if (snapshot.bot === null) return "off";
  return snapshot.bot.connected ? "connected" : "idle";
}

export const maxNameLength = 300;
const maxUrl = 2048;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function optionalText(x: unknown): string | undefined | false {
  if (x === undefined) return undefined;
  return typeof x === "string" && x.length <= 200 ? x : false;
}

/** The bot status out of a server's answer, or null when it is not one. Keeps only what the app reads. */
export function botFrom(x: unknown): PresenceBot | null {
  if (!isObject(x) || typeof x.connected !== "boolean") return null;

  const guildName = optionalText(x.guildName);
  const channelName = optionalText(x.channelName);
  if (guildName === false || channelName === false) return null;

  return {
    connected: x.connected,
    ...(guildName !== undefined ? { guildName } : {}),
    ...(channelName !== undefined ? { channelName } : {})
  };
}

/** A renderer's report of what it plays. null is valid: it stopped. */
export function isPlayingReport(x: unknown): x is PlayingReport | null {
  if (x === null) return true;
  if (!isObject(x)) return false;

  return (
    (x.mode === "local" || x.mode === "discord") &&
    typeof x.name === "string" &&
    x.name.length > 0 &&
    x.name.length <= maxNameLength
  );
}

/**
 * The server address the renderer reports, normalized (no trailing slash), or
 * undefined when it is not one. null is a valid report: no active server.
 */
export function serverUrl(x: unknown): string | null | undefined {
  if (x === null) return null;
  if (typeof x !== "string" || x.length === 0 || x.length > maxUrl) return undefined;

  try {
    const url = new URL(x);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname === "") {
      return undefined;
    }
    return x.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/** A snapshot arriving in a renderer, from main: trusted less than it looks, so shaped before it is used. */
export function isPresenceSnapshot(x: unknown): x is PresenceSnapshot {
  if (!isObject(x) || typeof x.silent !== "boolean") return false;
  if (x.server !== null && serverUrl(x.server) === undefined) return false;
  if (x.bot !== null && botFrom(x.bot) === null) return false;
  if (x.playing !== null) {
    if (!isObject(x.playing) || typeof x.playing.since !== "number") return false;
    if (!isPlayingReport({ mode: x.playing.mode, name: x.playing.name })) return false;
  }
  return true;
}

/** renderer -> main: the settings that decide which native surfaces exist. */
export const presenceSettingsChannel = "presence:settings";

export type QuickAccessStyle = "favorites" | "connection";
export type QuickAccessClick = "local" | "discord";

/**
 * Persisted by the renderer (src/storage.ts) and pushed up on change; main
 * keeps the last one so the tray outlives a closed window.
 */
export interface PresenceSettings {
  /** Mostrar na barra de menus. Everything below needs it. */
  tray: boolean;
  /** Painel rápido. */
  quickAccess: boolean;
  quickAccessStyle: QuickAccessStyle;
  /** What a click on a card's body does in quick access. */
  quickAccessClick: QuickAccessClick;
  /** macOS: the clip's name beside the glyph. */
  title: boolean;
  /** Windows and Linux: closing the window keeps the app running. */
  background: boolean;
}

export const defaultPresenceSettings: PresenceSettings = {
  tray: false,
  quickAccess: false,
  quickAccessStyle: "favorites",
  quickAccessClick: "local",
  title: false,
  background: false
};

export function isPresenceSettings(x: unknown): x is PresenceSettings {
  if (!isObject(x)) return false;

  return (
    typeof x.tray === "boolean" &&
    typeof x.quickAccess === "boolean" &&
    (x.quickAccessStyle === "favorites" || x.quickAccessStyle === "connection") &&
    (x.quickAccessClick === "local" || x.quickAccessClick === "discord") &&
    typeof x.title === "boolean" &&
    typeof x.background === "boolean"
  );
}

/** Quick access needs the icon to be clicked; a setting cannot switch on what it depends on. */
export function effectiveSettings(settings: PresenceSettings): PresenceSettings {
  return settings.tray ? settings : { ...settings, quickAccess: false, title: false };
}

const maxTitle = 24;

/** The text beside the macOS glyph: the playing clip's name, shortened, or empty. */
export function trayTitle(snapshot: PresenceSnapshot, settings: PresenceSettings): string {
  if (!settings.tray || !settings.title || !snapshot.playing) return "";

  const { name } = snapshot.playing;
  return name.length > maxTitle ? `${name.slice(0, maxTitle - 1).trimEnd()}…` : name;
}

type Text = (key: string, options?: Record<string, unknown>) => string;

/** One line for the top of every menu: what the app is doing, in the order that matters. */
export function statusLine(snapshot: PresenceSnapshot, t: Text): string {
  if (snapshot.server === null) return t("server.none");
  if (snapshot.silent) return t("presence.silent");
  if (snapshot.playing) return t("presence.playing", { name: snapshot.playing.name });
  if (snapshot.bot === null) return t("presence.checking");
  if (!snapshot.bot.connected) return t("server.notInVoice");

  const { guildName, channelName } = snapshot.bot;
  return guildName && channelName
    ? t("server.inVoice", { guildName, channelName })
    : t("presence.connected");
}
