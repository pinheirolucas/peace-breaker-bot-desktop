// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { translatorFor } from "../electron/menuI18n";
import { initialMenuState, menuBar, serverMenu } from "../electron/menuTemplates";
import type { Item, MenuDeps } from "../electron/menuTemplates";
import {
  botFrom,
  emptyPresence,
  forgetsChannel,
  isPresenceSnapshot,
  isVoiceResult,
  lastChannelFrom,
  presenceReduce,
  voiceAction
} from "../electron/presence";
import type { PresenceSnapshot, VoiceAction } from "../electron/presence";
import { trayMenu, voiceMenuItems } from "../electron/trayMenu";

const server = "http://192.168.0.5:9001/api/v1";
const geral = { connected: true, guildName: "Casa", channelId: "234567890123456789", channelName: "geral" };
const remembered = { channelId: "234567890123456789", guildName: "Casa", channelName: "geral" };

const snap = (patch: Partial<PresenceSnapshot> = {}): PresenceSnapshot => ({ ...emptyPresence, server, ...patch });
const labels = (items: Item[]) => items.map((item) => (item.type === "separator" ? "-" : item.label));

describe("remembering the last channel", () => {
  it("remembers the channel from any status that names one", () => {
    const next = presenceReduce(snap(), { type: "poll", bot: geral, silent: false });
    expect(next.lastChannel).toEqual(remembered);
  });

  it("keeps it through leaving, silence and a server switch", () => {
    let state = presenceReduce(snap(), { type: "poll", bot: geral, silent: false });
    state = presenceReduce(state, { type: "poll", bot: { connected: false }, silent: false });
    state = presenceReduce(state, { type: "poll", bot: null, silent: true });
    state = presenceReduce(state, { type: "server", server: "http://10.0.0.2:9001/api/v1" });

    expect(state.lastChannel).toEqual(remembered);
  });

  it("keeps only the newest channel", () => {
    let state = presenceReduce(snap(), { type: "poll", bot: geral, silent: false });
    state = presenceReduce(state, {
      type: "poll",
      bot: { connected: true, channelId: "345678901234567890", channelName: "jogos" },
      silent: false
    });

    expect(state.lastChannel).toEqual({ channelId: "345678901234567890", channelName: "jogos" });
  });

  it("does not remember a connected status without a channel ID", () => {
    const next = presenceReduce(snap(), { type: "poll", bot: { connected: true, channelName: "geral" }, silent: false });
    expect(next.lastChannel).toBeNull();
  });

  it("counts a new channel as a change even when the bot status looks the same", () => {
    const state = presenceReduce(snap(), { type: "poll", bot: geral, silent: false });
    const moved = presenceReduce(state, { type: "poll", bot: { ...geral, channelId: "999" }, silent: false });

    expect(moved).not.toBe(state);
    expect(moved.lastChannel?.channelId).toBe("999");
  });

  it("takes a stored channel only when it has none of its own", () => {
    const seeded = presenceReduce(snap(), { type: "seed-channel", lastChannel: remembered });
    expect(seeded.lastChannel).toEqual(remembered);

    const own = presenceReduce(snap(), { type: "poll", bot: { ...geral, channelId: "999" }, silent: false });
    expect(presenceReduce(own, { type: "seed-channel", lastChannel: remembered })).toBe(own);
  });

  it("forgets it on request, and only then", () => {
    const state = presenceReduce(snap(), { type: "seed-channel", lastChannel: remembered });
    expect(presenceReduce(state, { type: "forget-channel" }).lastChannel).toBeNull();
    expect(presenceReduce(snap(), { type: "forget-channel" })).toEqual(snap());
  });

  it("forgets it only when the channel itself is gone", () => {
    expect(forgetsChannel("channel_not_found")).toBe(true);
    expect(forgetsChannel("not_voice_channel")).toBe(true);
    expect(forgetsChannel("voice_join_failed")).toBe(false);
    expect(forgetsChannel("bot_not_ready")).toBe(false);
    expect(forgetsChannel(null)).toBe(false);
  });
});

describe("validators", () => {
  it("botFrom keeps a snowflake channel ID and refuses anything else", () => {
    expect(botFrom(geral)).toEqual(geral);
    expect(botFrom({ connected: true, channelId: 234 })).toBeNull();
    expect(botFrom({ connected: true, channelId: "abc" })).toBeNull();
  });

  it("lastChannelFrom needs an ID and shapes the rest", () => {
    expect(lastChannelFrom(remembered)).toEqual(remembered);
    expect(lastChannelFrom({ channelId: "1", extra: true })).toEqual({ channelId: "1" });
    expect(lastChannelFrom({ channelName: "geral" })).toBeNull();
    expect(lastChannelFrom({ channelId: "1", channelName: 3 })).toBeNull();
    expect(lastChannelFrom(null)).toBeNull();
    expect(lastChannelFrom("234567890123456789")).toBeNull();
  });

  it("isPresenceSnapshot checks the remembered channel", () => {
    expect(isPresenceSnapshot(snap({ lastChannel: remembered }))).toBe(true);
    expect(isPresenceSnapshot(snap({ lastChannel: { channelId: "x" } }))).toBe(false);
  });

  it("isVoiceResult accepts the three shapes", () => {
    expect(isVoiceResult({ ok: true })).toBe(true);
    expect(isVoiceResult({ ok: false, offline: true })).toBe(true);
    expect(isVoiceResult({ ok: false, offline: false, label: "bot_not_ready" })).toBe(true);
    expect(isVoiceResult({ ok: false, offline: false, label: null })).toBe(true);
    expect(isVoiceResult({ ok: false, offline: false, label: 3 })).toBe(false);
    expect(isVoiceResult({ ok: false })).toBe(false);
    expect(isVoiceResult(null)).toBe(false);
  });
});

describe("voiceAction", () => {
  it("offers nothing with no server", () => {
    expect(voiceAction(null, geral, remembered)).toBeNull();
  });

  it("offers leave while the bot is in a channel, naming it when it can", () => {
    expect(voiceAction(server, geral, null)).toEqual({ kind: "leave", channelName: "geral" });
    expect(voiceAction(server, { connected: true }, null)).toEqual({ kind: "leave" });
  });

  it("offers leave while the status is unknown: leaving is idempotent", () => {
    expect(voiceAction(server, null, remembered)).toEqual({ kind: "leave" });
  });

  it("offers rejoin once the bot is out and a channel is remembered", () => {
    expect(voiceAction(server, { connected: false }, remembered)).toEqual({
      kind: "rejoin",
      channelName: "geral",
      guildName: "Casa"
    });
    expect(voiceAction(server, { connected: false }, { channelId: "1" })).toEqual({ kind: "rejoin" });
  });

  it("says there is nothing to rejoin when the bot is out and nothing is remembered", () => {
    expect(voiceAction(server, { connected: false }, null)).toEqual({ kind: "none" });
  });
});

describe("native menus", () => {
  const t = translatorFor("pt-BR");
  const on = () => ({ leave: vi.fn(), rejoin: vi.fn() });

  it("names the row, and leaves it out with nothing to offer", () => {
    const row = (action: VoiceAction) => labels(voiceMenuItems(action, t, on()));

    expect(row({ kind: "leave", channelName: "geral" })).toEqual(["Tirar o bot de #geral"]);
    expect(row({ kind: "leave" })).toEqual(["Tirar o bot do canal"]);
    expect(row({ kind: "rejoin", channelName: "geral" })).toEqual(["Chamar o bot para #geral"]);
    expect(row({ kind: "rejoin" })).toEqual(["Chamar o bot para o último canal"]);
    expect(row({ kind: "none" })).toEqual([]);
    expect(row(null)).toEqual([]);
  });

  it("uses title case in English", () => {
    const en = translatorFor("en-US");
    expect(labels(voiceMenuItems({ kind: "leave", channelName: "general" }, en, on()))).toEqual([
      "Take the Bot Out of #general"
    ]);
    expect(labels(voiceMenuItems({ kind: "rejoin", channelName: "general" }, en, on()))).toEqual([
      "Call the Bot to #general"
    ]);
  });

  it("runs the matching handler", () => {
    const handlers = on();
    (voiceMenuItems({ kind: "leave" }, t, handlers)[0].click as () => void)();
    (voiceMenuItems({ kind: "rejoin" }, t, handlers)[0].click as () => void)();

    expect(handlers.leave).toHaveBeenCalledTimes(1);
    expect(handlers.rejoin).toHaveBeenCalledTimes(1);
  });

  it("puts rejoin in the tray menu once the bot is out, after Parar reprodução", () => {
    const handlers = {
      stop: vi.fn(),
      "open-quick-access": vi.fn(),
      "open-app": vi.fn(),
      "open-settings": vi.fn(),
      refresh: vi.fn(),
      quit: vi.fn(),
      ...on()
    };
    const out = snap({ bot: { connected: false }, lastChannel: remembered });
    const shown = labels(trayMenu(out, { quickAccess: false, quit: true }, t, handlers));

    expect(shown.slice(shown.indexOf("Parar reprodução"), shown.indexOf("Parar reprodução") + 2)).toEqual([
      "Parar reprodução",
      "Chamar o bot para #geral"
    ]);
    expect(labels(trayMenu(snap({ bot: { connected: false } }), { quickAccess: false, quit: true }, t, handlers)))
      .not.toContain("Chamar o bot");
    expect(labels(trayMenu({ ...emptyPresence }, { quickAccess: false, quit: true }, t, handlers)))
      .not.toContain("Tirar o bot do canal");
  });

  function deps(voice?: MenuDeps["voice"]): MenuDeps {
    return {
      t,
      platform: "darwin",
      send: vi.fn(),
      copy: vi.fn(),
      openExternal: vi.fn(),
      reveal: vi.fn(),
      openSettings: vi.fn(),
      ...(voice ? { voice } : {})
    };
  }

  const active = { ...initialMenuState("pt-BR"), activeAddress: "192.168.0.5:9001", botConnected: true, botChannel: "Casa · #geral" };

  it("puts the row under the bot's line in the chip's right-click menu", () => {
    const handlers = on();
    const menu = serverMenu(active, deps({ action: { kind: "leave", channelName: "geral" }, ...handlers }));

    expect(labels(menu).slice(0, 4)).toEqual(["192.168.0.5:9001", "Casa · #geral", "Tirar o bot de #geral", "-"]);
    (menu[2].click as () => void)();
    expect(handlers.leave).toHaveBeenCalledTimes(1);
  });

  it("has no row without main's record, or with no server", () => {
    expect(labels(serverMenu(active, deps()))).not.toContain("Tirar o bot de #geral");
    expect(
      labels(serverMenu(initialMenuState("pt-BR"), deps({ action: { kind: "leave" }, ...on() })))
    ).not.toContain("Tirar o bot do canal");
  });

  it("puts the same row in the menu bar's Servidor menu", () => {
    const bar = menuBar(
      { ...active, botConnected: false, botChannel: null },
      deps({ action: { kind: "rejoin", channelName: "geral" }, ...on() }),
      { isDev: false, appName: "Peace Breaker Bot", checkForUpdates: vi.fn() }
    );
    const servidor = bar.find((item) => item.label === "Servidor")!.submenu as Item[];

    expect(labels(servidor).slice(0, 3)).toEqual([
      "192.168.0.5:9001",
      "Bot fora de um canal de voz",
      "Chamar o bot para #geral"
    ]);
  });
});
