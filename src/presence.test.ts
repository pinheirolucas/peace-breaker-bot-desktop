// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { translatorFor } from "../electron/menuI18n";
import {
  botFrom,
  defaultPresenceSettings,
  effectiveSettings,
  emptyPresence,
  isPlayingReport,
  isPresenceSettings,
  isPresenceSnapshot,
  mergePlaying,
  presenceReduce,
  statusLine,
  serverUrl,
  trayState,
  trayTitle
} from "../electron/presence";
import type { PresenceSnapshot } from "../electron/presence";
import { actionFromArgv, jumpListTasks, trayMenu } from "../electron/trayMenu";
import type { TrayHandlers } from "../electron/trayMenu";

const server = "http://192.168.0.5:9001/api/v1";
const inChannel = { connected: true, guildName: "Casa", channelName: "geral" };
const playing = { mode: "discord" as const, name: "Vine boom", since: 10 };

const snap = (patch: Partial<PresenceSnapshot> = {}): PresenceSnapshot => ({
  ...emptyPresence,
  ...patch
});

describe("presenceReduce", () => {
  it("returns the same object when nothing changed", () => {
    const state = snap({ server, bot: inChannel, playing });

    expect(presenceReduce(state, { type: "server", server })).toBe(state);
    expect(presenceReduce(state, { type: "poll", bot: { ...inChannel }, silent: false })).toBe(state);
    expect(presenceReduce(state, { type: "playing", playing: { ...playing } })).toBe(state);
  });

  it("forgets the bot when the server changes, and keeps what plays", () => {
    const state = snap({ server, bot: inChannel, playing });
    const next = presenceReduce(state, { type: "server", server: "http://10.0.0.2:9001/api/v1" });

    expect(next.bot).toBeNull();
    expect(next.playing).toEqual(playing);
  });

  it("marks a server silent, and any answer clears it", () => {
    const silent = presenceReduce(snap({ server }), { type: "poll", bot: null, silent: true });
    expect(silent.silent).toBe(true);
    expect(presenceReduce(silent, { type: "poll", bot: null, silent: false }).silent).toBe(false);
    // A new server starts unknown, not silent.
    expect(presenceReduce(silent, { type: "server", server: "http://10.0.0.2:9001/api/v1" }).silent).toBe(false);
  });

  it("takes a bot status and a stop", () => {
    const state = presenceReduce(snap({ server }), {
      type: "poll",
      bot: { connected: false },
      silent: false
    });
    expect(state.bot).toEqual({ connected: false });
    expect(presenceReduce(snap({ playing }), { type: "playing", playing: null }).playing).toBeNull();
  });
});

describe("mergePlaying", () => {
  it("is nothing when nothing plays", () => {
    expect(mergePlaying([null, null], null, 5)).toBeNull();
    expect(mergePlaying([], playing, 5)).toBeNull();
  });

  it("stamps since when a clip starts and keeps it while it goes on", () => {
    const first = mergePlaying([{ mode: "local", name: "A" }], null, 100);
    expect(first).toEqual({ mode: "local", name: "A", since: 100 });
    expect(mergePlaying([{ mode: "local", name: "A" }], first, 200)).toBe(first);
    expect(mergePlaying([{ mode: "local", name: "B" }], first, 200)).toEqual({
      mode: "local",
      name: "B",
      since: 200
    });
  });

  it("does not flip between two windows that both report", () => {
    const first = mergePlaying([{ mode: "local", name: "A" }], null, 100);
    const reports = [
      { mode: "local" as const, name: "A" },
      { mode: "discord" as const, name: "B" }
    ];
    // B is newer, but A is what the record already says.
    expect(mergePlaying(reports, first, 200)).toBe(first);
    // Once A is gone, B is the record.
    expect(mergePlaying([reports[1]], first, 300)).toEqual({ mode: "discord", name: "B", since: 300 });
  });
});

describe("trayState", () => {
  it("is off with no server, whatever else is known", () => {
    expect(trayState(snap())).toBe("off");
    expect(trayState(snap({ bot: inChannel, playing }))).toBe("off");
  });

  it("is playing while something plays", () => {
    expect(trayState(snap({ server, bot: inChannel, playing }))).toBe("playing");
  });

  it("reads the bot's own answer", () => {
    expect(trayState(snap({ server, bot: inChannel }))).toBe("connected");
    expect(trayState(snap({ server, bot: { connected: false } }))).toBe("idle");
  });

  it("is off while the server is silent, even mid-clip", () => {
    expect(trayState(snap({ server, silent: true, playing }))).toBe("off");
  });

  it("never reads an unknown bot as out of its channel", () => {
    expect(trayState(snap({ server, bot: null }))).toBe("off");
  });
});

describe("validators", () => {
  it("botFrom keeps only what the app reads", () => {
    expect(botFrom({ connected: true, guildName: "G", channelName: "c", guildId: "1" })).toEqual({
      connected: true,
      guildName: "G",
      channelName: "c"
    });
    expect(botFrom({ connected: false })).toEqual({ connected: false });
    expect(botFrom({ connected: "yes" })).toBeNull();
    expect(botFrom({ connected: true, guildName: 3 })).toBeNull();
    expect(botFrom({ connected: true, guildName: "x".repeat(201) })).toBeNull();
    expect(botFrom(null)).toBeNull();
  });

  it("isPlayingReport accepts a clip or null", () => {
    expect(isPlayingReport(null)).toBe(true);
    expect(isPlayingReport({ mode: "local", name: "A" })).toBe(true);
    expect(isPlayingReport({ mode: "both", name: "A" })).toBe(false);
    expect(isPlayingReport({ mode: "local", name: "" })).toBe(false);
    expect(isPlayingReport({ mode: "local", name: "x".repeat(301) })).toBe(false);
    expect(isPlayingReport("A")).toBe(false);
    expect(isPlayingReport(undefined)).toBe(false);
  });

  it("serverUrl normalizes and accepts null", () => {
    expect(serverUrl("http://192.168.0.5:9001/api/v1/")).toBe(server);
    expect(serverUrl(null)).toBeNull();
    for (const bad of [undefined, 3, "", "ftp://x", "not a url", "file:///x"]) {
      expect(serverUrl(bad)).toBeUndefined();
    }
  });

  it("isPresenceSnapshot shapes what main sends", () => {
    expect(isPresenceSnapshot(snap({ server, bot: inChannel, playing }))).toBe(true);
    expect(isPresenceSnapshot(emptyPresence)).toBe(true);
    expect(isPresenceSnapshot({ ...emptyPresence, server: "nope" })).toBe(false);
    expect(isPresenceSnapshot({ ...emptyPresence, playing: { mode: "local", name: "A" } })).toBe(false);
    expect(isPresenceSnapshot(null)).toBe(false);
    expect(isPresenceSnapshot({ bot: null, playing: null, server: null })).toBe(false);
  });

  it("isPresenceSettings needs every field", () => {
    expect(isPresenceSettings(defaultPresenceSettings)).toBe(true);
    expect(isPresenceSettings({ ...defaultPresenceSettings, panelStyle: "x" })).toBe(false);
    expect(isPresenceSettings({ ...defaultPresenceSettings, tray: 1 })).toBe(false);
    expect(isPresenceSettings({ tray: true })).toBe(false);
  });
});

describe("settings", () => {
  it("switches quick access and the title off with the icon", () => {
    const all = { ...defaultPresenceSettings, tray: true, panel: true, title: true };

    expect(effectiveSettings(all)).toBe(all);
    expect(effectiveSettings({ ...all, tray: false })).toMatchObject({ panel: false, title: false });
  });

  it("shows a shortened clip name only when asked", () => {
    const on = { ...defaultPresenceSettings, tray: true, title: true };
    const state = snap({ server, playing: { ...playing, name: "A very long sound name indeed" } });

    expect(trayTitle(state, on)).toBe("A very long sound name…");
    expect(trayTitle(state, { ...on, title: false })).toBe("");
    expect(trayTitle(snap({ server }), on)).toBe("");
    expect(trayTitle(snap({ server, playing }), on)).toBe("Vine boom");
  });
});

describe("tray menu", () => {
  const t = translatorFor("pt-BR");
  const handlers = (): TrayHandlers & Record<string, ReturnType<typeof vi.fn>> => ({
    stop: vi.fn(),
    "open-quick-access": vi.fn(),
    "open-app": vi.fn(),
    refresh: vi.fn(),
    quit: vi.fn()
  });
  const labels = (items: { label?: string; type?: string }[]) =>
    items.map((item) => (item.type === "separator" ? "-" : item.label));

  it("lists status, open, stop, search again and quit, in that order", () => {
    const menu = trayMenu(snap({ server, bot: inChannel }), { panel: true, quit: true }, t, handlers());

    expect(labels(menu)).toEqual([
      "Casa · #geral",
      "-",
      "Abrir Peace Breaker Bot",
      "Abrir acesso rápido",
      "-",
      "Parar reprodução",
      "Procurar servidor novamente",
      "-",
      "Sair"
    ]);
  });

  it("leaves out Abrir acesso rápido when it is off, with no doubled or orphan separator", () => {
    const menu = trayMenu(snap({ server }), { panel: false, quit: true }, t, handlers());

    expect(labels(menu)).toEqual([
      "Verificando o servidor…",
      "-",
      "Abrir Peace Breaker Bot",
      "-",
      "Parar reprodução",
      "Procurar servidor novamente",
      "-",
      "Sair"
    ]);
  });

  it("has no trailing separator on the Dock, which has no Quit, and no Sair", () => {
    for (const panel of [true, false]) {
      const menu = trayMenu(snap({ server }), { panel, quit: false }, t, handlers());
      const shown = labels(menu);

      expect(shown).not.toContain("Sair");
      expect(shown.at(-1)).toBe("Procurar servidor novamente");
      expect(shown.some((label, i) => label === "-" && shown[i - 1] === "-")).toBe(false);
      expect(labels(menu).includes("Abrir acesso rápido")).toBe(panel);
    }
  });

  it("disables Parar reprodução until something plays", () => {
    const idle = trayMenu(snap({ server }), { panel: false, quit: true }, t, handlers());
    const busy = trayMenu(snap({ server, playing }), { panel: false, quit: true }, t, handlers());

    const stop = (items: { label?: string; enabled?: boolean }[]) => items.find((item) => item.label === "Parar reprodução");

    expect(stop(idle)?.enabled).toBe(false);
    expect(stop(busy)?.enabled).toBe(true);
    expect(idle[0].enabled).toBe(false);
  });

  it("wires each row to its handler", () => {
    const on = handlers();
    const menu = trayMenu(snap({ server, playing }), { panel: true, quit: true }, t, on);
    const click = (label: string) =>
      (menu.find((item) => item.label === label)?.click as unknown as () => void)();

    click("Parar reprodução");
    click("Abrir acesso rápido");
    click("Abrir Peace Breaker Bot");
    click("Procurar servidor novamente");
    click("Sair");

    for (const key of ["stop", "open-quick-access", "open-app", "refresh", "quit"]) {
      expect(on[key]).toHaveBeenCalledTimes(1);
    }
  });

  it("says what is going on, in the order that matters", () => {
    expect(statusLine(snap(), t)).toBe("Nenhum servidor encontrado");
    expect(statusLine(snap({ server, bot: inChannel, playing }), t)).toBe("Tocando: Vine boom");
    expect(statusLine(snap({ server }), t)).toBe("Verificando o servidor…");
    expect(statusLine(snap({ server, silent: true }), t)).toBe("Servidor não está respondendo");
    expect(statusLine(snap({ server, bot: { connected: false } }), t)).toBe(
      "bot fora de um canal de voz"
    );
    expect(statusLine(snap({ server, bot: { connected: true } }), t)).toBe("Bot em um canal de voz");
  });

  it("follows the language", () => {
    expect(statusLine(snap(), translatorFor("en-US"))).toBe("No servers found");
  });
});

describe("jump list and launch actions", () => {
  const t = translatorFor("pt-BR");

  it("carries stop only while something plays, and quick access only when on", () => {
    const titles = (state: PresenceSnapshot, panel: boolean) =>
      jumpListTasks(state, panel, t).map((task) => task.title);

    expect(titles(snap({ server }), false)).toEqual(["Procurar servidor novamente"]);
    expect(titles(snap({ server, playing }), true)).toEqual([
      "Abrir acesso rápido",
      "Parar reprodução",
      "Procurar servidor novamente"
    ]);
  });

  it("reads --action= from a launch", () => {
    expect(actionFromArgv(["app", "--action=stop"])).toBe("stop");
    expect(actionFromArgv(["app", "--action=open-quick-access"])).toBe("open-quick-access");
    // a Jump List or desktop entry written before the rename
    expect(actionFromArgv(["app", "--action=open-panel"])).toBe("open-quick-access");
    expect(actionFromArgv(["app", "--action=rm -rf"])).toBeNull();
    expect(actionFromArgv(["app"])).toBeNull();
  });
});
