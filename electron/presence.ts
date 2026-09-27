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
/** Take the bot out of its voice channel. Invoked: answers with a VoiceResult. */
export const presenceLeaveChannel = "presence:leave";
/** Call the bot back to the remembered channel. Invoked: answers with a VoiceResult. */
export const presenceRejoinChannel = "presence:rejoin";
/** The main window's stored last channel, handed to main once at launch. */
export const presenceLastChannelChannel = "presence:last-channel";
// main -> renderer
/** The whole record, on every change. */
export const presenceSnapshotChannel = "presence:snapshot";

/** What GET /bot/status answers, as the renderer's own BotStatus type. */
export interface PresenceBot {
  connected: boolean;
  guildName?: string;
  channelId?: string;
  channelName?: string;
}

/** The one voice channel the app remembers: the last one it saw the bot in. */
export interface LastChannel {
  channelId: string;
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
  /** Survives leaving, server switches and restarts; only a join that finds the channel gone clears it. */
  lastChannel: LastChannel | null;
}

export const emptyPresence: PresenceSnapshot = {
  bot: null,
  playing: null,
  server: null,
  silent: false,
  lastChannel: null
};

export type PresenceAction =
  | { type: "server"; server: string | null }
  | { type: "poll"; bot: PresenceBot | null; silent: boolean }
  | { type: "playing"; playing: Playing | null }
  | { type: "seed-channel"; lastChannel: LastChannel }
  | { type: "forget-channel" };

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
    case "poll": {
      const lastChannel = rememberedFrom(action.bot) ?? state.lastChannel;
      return sameBot(action.bot, state.bot) &&
        action.silent === state.silent &&
        sameChannel(lastChannel, state.lastChannel)
        ? state
        : { ...state, bot: action.bot, silent: action.silent, lastChannel };
    }
    case "playing":
      return samePlaying(action.playing, state.playing) ? state : { ...state, playing: action.playing };
    // What the app saw itself always beats what was stored before it started.
    case "seed-channel":
      return state.lastChannel ? state : { ...state, lastChannel: action.lastChannel };
    case "forget-channel":
      return state.lastChannel ? { ...state, lastChannel: null } : state;
  }
}

function rememberedFrom(bot: PresenceBot | null): LastChannel | null {
  if (!bot?.connected || !bot.channelId) return null;

  return {
    channelId: bot.channelId,
    ...(bot.guildName !== undefined ? { guildName: bot.guildName } : {}),
    ...(bot.channelName !== undefined ? { channelName: bot.channelName } : {})
  };
}

function sameChannel(a: LastChannel | null, b: LastChannel | null): boolean {
  if (a === null || b === null) return a === b;
  return a.channelId === b.channelId && a.guildName === b.guildName && a.channelName === b.channelName;
}

function sameBot(a: PresenceBot | null, b: PresenceBot | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.connected === b.connected &&
    a.guildName === b.guildName &&
    a.channelId === b.channelId &&
    a.channelName === b.channelName
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

/** A Discord snowflake as the bot sends it: a string of digits. */
function optionalSnowflake(x: unknown): string | undefined | false {
  if (x === undefined) return undefined;
  return typeof x === "string" && /^\d{1,25}$/.test(x) ? x : false;
}

/** The bot status out of a server's answer, or null when it is not one. Keeps only what the app reads. */
export function botFrom(x: unknown): PresenceBot | null {
  if (!isObject(x) || typeof x.connected !== "boolean") return null;

  const guildName = optionalText(x.guildName);
  const channelId = optionalSnowflake(x.channelId);
  const channelName = optionalText(x.channelName);
  if (guildName === false || channelId === false || channelName === false) return null;

  return {
    connected: x.connected,
    ...(guildName !== undefined ? { guildName } : {}),
    ...(channelId !== undefined ? { channelId } : {}),
    ...(channelName !== undefined ? { channelName } : {})
  };
}

/** A remembered channel, from main or from storage, or null when it is not one. */
export function lastChannelFrom(x: unknown): LastChannel | null {
  if (!isObject(x)) return null;

  const channelId = optionalSnowflake(x.channelId);
  const guildName = optionalText(x.guildName);
  const channelName = optionalText(x.channelName);
  if (typeof channelId !== "string" || guildName === false || channelName === false) return null;

  return {
    channelId,
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
  if (x.lastChannel !== null && lastChannelFrom(x.lastChannel) === null) return false;
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
/**
 * The colour of the status dot, shared by every view of presence: the quick
 * access strip (`stripTone`) and the tray menu's first row. Green connected,
 * amber the server answers but the bot is out of its channel, red silent, grey
 * unknown. A null bot status is unknown, never amber or red.
 */
export type StatusTone = "ok" | "warn" | "down" | "unknown";

export function statusTone(snapshot: PresenceSnapshot): StatusTone {
  if (snapshot.server === null) return "unknown";
  if (snapshot.silent) return "down";
  if (snapshot.bot === null) return "unknown";
  return snapshot.bot.connected ? "ok" : "warn";
}

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

/** What leave or rejoin came to: done, no answer at all, or the bot's error label (null when it sent none). */
export type VoiceResult = { ok: true } | { ok: false; offline: true } | { ok: false; offline: false; label: string | null };

export function isVoiceResult(x: unknown): x is VoiceResult {
  if (!isObject(x) || typeof x.ok !== "boolean") return false;
  if (x.ok) return true;
  if (x.offline === true) return true;
  return x.offline === false && (x.label === null || (typeof x.label === "string" && x.label.length <= 100));
}

/** A join that answers these means the channel itself is gone, so remembering it helps no one. */
export function forgetsChannel(label: string | null): boolean {
  return label === "channel_not_found" || label === "not_voice_channel";
}

/**
 * The one row every surface puts next to the bot's channel. Leave while the
 * bot may be in one (unknown included: leaving is idempotent, and its answer
 * tells the truth); rejoin when it is confirmed out and a channel is
 * remembered; "none" when it is out and nothing is; null with no server.
 */
export type VoiceAction =
  | { kind: "leave"; channelName?: string }
  | { kind: "rejoin"; channelName?: string; guildName?: string }
  | { kind: "none" }
  | null;

export function voiceAction(
  server: string | null,
  bot: { connected: boolean; channelName?: string } | null,
  lastChannel: LastChannel | null
): VoiceAction {
  if (server === null) return null;

  if (bot?.connected !== false) {
    return bot?.connected && bot.channelName ? { kind: "leave", channelName: bot.channelName } : { kind: "leave" };
  }

  if (!lastChannel) return { kind: "none" };

  return {
    kind: "rejoin",
    ...(lastChannel.channelName !== undefined ? { channelName: lastChannel.channelName } : {}),
    ...(lastChannel.guildName !== undefined ? { guildName: lastChannel.guildName } : {})
  };
}
