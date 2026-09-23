import { describe, expect, it, vi } from "vitest";
import { translatorFor } from "../electron/menuI18n";
import type { CardContext, MenuServer, MenuState } from "../electron/menuState";
import {
  cardMenu,
  fieldMenu,
  gridMenu,
  initialMenuState,
  menuBar,
  serverMenu,
  serverRowMenu
} from "../electron/menuTemplates";
import type { Item, MenuDeps } from "../electron/menuTemplates";
import { cardState } from "./components/InstantCard";
import type { Playback } from "./components/InstantCard";
import type { BotStatus } from "./service";

function deps(platform = "darwin", language: "pt-BR" | "en-US" = "pt-BR") {
  const send = vi.fn();
  const copy = vi.fn();
  const openExternal = vi.fn();
  const reveal = vi.fn();
  const value: MenuDeps = { t: translatorFor(language), platform, send, copy, openExternal, reveal };
  return { ...value, send, copy, openExternal, reveal };
}

function card(
  playback: Playback,
  options: { otherPlaying?: boolean; bot?: BotStatus | null } & Partial<CardContext> = {}
): CardContext {
  const { otherPlaying = false, bot = null, ...rest } = options;
  const state = cardState(playback, otherPlaying, bot);

  return {
    surface: "favorites",
    url: "https://www.myinstants.com/pt/instant/vine-boom/",
    name: "Vine boom",
    playback,
    state: {
      playDisabled: state.playDisabled,
      discordDisabled: state.discordDisabled,
      botGated: state.botGated,
      stopDisabled: state.stopDisabled,
      trailDisabled: state.trailDisabled
    },
    key: null,
    organizing: false,
    favorite: false,
    providerName: "MyInstants",
    index: 1,
    total: 3,
    width: 156,
    ...rest
  };
}

const labels = (items: Item[]) => items.map((item) => (item.type === "separator" ? "-" : item.label));
const find = (items: Item[], label: string) => items.find((item) => item.label === label)!;
const state = (patch: Partial<MenuState> = {}): MenuState => ({ ...initialMenuState("pt-BR"), ...patch });

describe("card menu", () => {
  it("Mostrar na pasta asks main to reveal the clip's file", () => {
    const d = deps();
    (find(cardMenu(card("idle"), d), "Mostrar na pasta").click as () => void)();

    expect(d.reveal).toHaveBeenCalledWith({
      name: "Vine boom",
      url: "https://www.myinstants.com/pt/instant/vine-boom/"
    });
  });

  it("idle: play, send, links, then rename and remove last", () => {
    const menu = cardMenu(card("idle"), deps());

    expect(labels(menu)).toEqual([
      "Tocar aqui",
      "Enviar ao Discord",
      "-",
      "Copiar link do áudio",
      "Mostrar na pasta",
      "Abrir no site",
      "-",
      "Renomear…",
      "Remover dos favoritos"
    ]);
    expect(menu.every((item) => item.enabled !== false)).toBe(true);
  });

  it("shows the favourite's key on the rows it triggers, read-only", () => {
    const menu = cardMenu(card("idle", { key: "a" }), deps());

    expect(find(menu, "Enviar ao Discord")).toMatchObject({ accelerator: "A", registerAccelerator: false });
    expect(find(menu, "Tocar aqui")).toMatchObject({ accelerator: "Shift+A", registerAccelerator: false });
    expect(find(cardMenu(card("idle"), deps()), "Tocar aqui").accelerator).toBeUndefined();
  });

  it("playing here: Parar with Esc, replay, Discord off, remove locked", () => {
    const menu = cardMenu(card("local", { key: "a" }), deps());

    expect(labels(menu).slice(0, 3)).toEqual(["Parar", "Tocar de novo", "Enviar ao Discord"]);
    expect(find(menu, "Parar")).toMatchObject({ accelerator: "Esc", enabled: true });
    expect(find(menu, "Tocar de novo").enabled).toBe(true);
    expect(find(menu, "Enviar ao Discord").enabled).toBe(false);
    expect(find(menu, "Remover dos favoritos").enabled).toBe(false);
  });

  it("playing on Discord: only this card is live, and there is no Discord row", () => {
    const menu = cardMenu(card("discord"), deps());

    expect(labels(menu).slice(0, 2)).toEqual(["Parar no Discord", "Tocar aqui"]);
    expect(find(menu, "Tocar aqui").enabled).toBe(false);
    expect(menu.some((item) => item.label === "Enviar ao Discord")).toBe(false);
  });

  it("another card playing disables both, without a bot reason", () => {
    const menu = cardMenu(card("idle", { otherPlaying: true }), deps());

    expect(find(menu, "Tocar aqui").enabled).toBe(false);
    expect(find(menu, "Enviar ao Discord")).toMatchObject({ enabled: false, sublabel: undefined });
  });

  it("disables send only when the bot is known to be away, never when unknown", () => {
    const away = cardMenu(card("idle", { bot: { connected: false } as BotStatus }), deps());
    expect(find(away, "Enviar ao Discord")).toMatchObject({ enabled: false, sublabel: "Bot fora de um canal de voz" });
    expect(find(away, "Tocar aqui").enabled).toBe(true);

    const unknown = cardMenu(card("idle", { bot: null }), deps());
    expect(find(unknown, "Enviar ao Discord").enabled).toBe(true);

    const connected = cardMenu(card("idle", { bot: { connected: true } as BotStatus }), deps());
    expect(find(connected, "Enviar ao Discord").enabled).toBe(true);
  });

  it("offers Definir tecla only in Organizar", () => {
    expect(labels(cardMenu(card("idle"), deps()))).not.toContain("Definir tecla…");

    const menu = cardMenu(card("idle", { organizing: true, key: "h", index: 0 }), deps());
    expect(labels(menu)).toEqual([
      "Renomear…",
      "Definir tecla…",
      "-",
      "Mover para o início",
      "Mover para o fim",
      "-",
      "Copiar link do áudio",
      "Mostrar na pasta",
      "Abrir no site",
      "-",
      "Remover dos favoritos"
    ]);
    expect(find(menu, "Mover para o início").enabled).toBe(false);
    expect(find(menu, "Mover para o fim").enabled).toBe(true);
  });

  it("Explorar: the star toggle is named for its action, and Abrir names the provider", () => {
    const off = cardMenu(card("idle", { surface: "explore", favorite: false }), deps());
    expect(labels(off)).toEqual([
      "Tocar aqui",
      "Enviar ao Discord",
      "-",
      "Adicionar aos favoritos",
      "-",
      "Copiar link do áudio",
      "Mostrar na pasta",
      "Abrir em MyInstants"
    ]);

    const on = cardMenu(card("idle", { surface: "explore", favorite: true }), deps());
    expect(labels(on)).toContain("Remover dos favoritos");
    expect(cardMenu(card("local", { surface: "explore", favorite: true }), deps()).find((i) => i.label === "Remover dos favoritos")!.enabled).toBe(false);
  });

  it("sends each action as data, with the card's url and width", () => {
    const d = deps();
    const menu = cardMenu(card("idle", { key: "a" }), d);

    (find(menu, "Renomear…").click as () => void)();
    expect(d.send).toHaveBeenCalledWith({
      type: "card",
      surface: "favorites",
      action: "rename",
      url: "https://www.myinstants.com/pt/instant/vine-boom/",
      width: 156
    });
  });

  it("copies the link, and opens it only when it is https", () => {
    const d = deps();
    const menu = cardMenu(card("idle"), d);

    (find(menu, "Copiar link do áudio").click as () => void)();
    expect(d.copy).toHaveBeenCalledWith("https://www.myinstants.com/pt/instant/vine-boom/");

    (find(menu, "Abrir no site").click as () => void)();
    expect(d.openExternal).toHaveBeenCalledWith("https://www.myinstants.com/pt/instant/vine-boom/");

    const d2 = deps();
    const unsafe = cardMenu(card("idle", { url: "http://insecure.test/x" }), d2);
    expect(find(unsafe, "Abrir no site").enabled).toBe(false);
    (find(unsafe, "Abrir no site").click as () => void)();
    expect(d2.openExternal).not.toHaveBeenCalled();
  });

  it("speaks the language it is given", () => {
    const menu = cardMenu(card("idle"), deps("darwin", "en-US"));
    expect(labels(menu)[0]).toBe("Play Here");
  });
});

describe("grid menu", () => {
  it("Favoritos: add, organize, import, export", () => {
    const menu = gridMenu(state({ hasFavorites: true }), deps());

    expect(labels(menu)).toEqual(["Adicionar instant…", "Organizar favoritos", "-", "Importar…", "Exportar…"]);
    expect(find(menu, "Adicionar instant…")).toMatchObject({ accelerator: "Cmd+N", registerAccelerator: false });
    expect(find(menu, "Organizar favoritos").enabled).toBe(true);
  });

  it("Favoritos with none: add and import only", () => {
    expect(labels(gridMenu(state(), deps()))).toEqual(["Adicionar instant…", "-", "Importar…"]);
  });

  it("gives Organizar the same disabled rules and reasons as Adicionar's menu", () => {
    const playing = find(gridMenu(state({ hasFavorites: true, organizeBlocked: "playing" }), deps()), "Organizar favoritos");
    expect(playing).toMatchObject({ enabled: false, sublabel: "Pare o som para organizar" });

    const searching = find(gridMenu(state({ hasFavorites: true, organizeBlocked: "search" }), deps()), "Organizar favoritos");
    expect(searching).toMatchObject({ enabled: false, sublabel: "Limpe a busca para organizar" });
  });

  it("has no menu in Organizar", () => {
    expect(gridMenu(state({ hasFavorites: true, organizing: true }), deps())).toEqual([]);
  });

  const explore = (patch: Partial<MenuState> = {}) =>
    state({
      tab: "explore",
      providers: [
        { key: "myinstants", name: "MyInstants" },
        { key: "instants.meme", name: "instants.meme" }
      ],
      provider: "myinstants",
      regionSupported: true,
      region: "br",
      regions: [
        { code: "br", label: "Brasil" },
        { code: "us", label: "Estados Unidos" }
      ],
      ...patch
    });

  it("Explorar: reload, Site and Região as submenus with the current one ticked, restore", () => {
    const d = deps();
    const menu = gridMenu(explore(), d);

    expect(labels(menu)).toEqual(["Recarregar listagem", "-", "Site", "Região", "-", "Restaurar padrão"]);
    expect(find(menu, "Restaurar padrão").enabled).toBe(false);

    const site = find(menu, "Site").submenu as Item[];
    expect(site.map((i) => [i.label, i.type, i.checked])).toEqual([
      ["MyInstants", "radio", true],
      ["instants.meme", "radio", false]
    ]);

    (site[1].click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "provider", key: "instants.meme" });

    const region = find(menu, "Região").submenu as Item[];
    (region[1].click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "region", region: "us" });
  });

  it("leaves Região out when the provider has none, and Site out when the registry is unknown", () => {
    expect(labels(gridMenu(explore({ regionSupported: false }), deps()))).not.toContain("Região");
    expect(labels(gridMenu(explore({ providers: null, provider: null }), deps()))).not.toContain("Site");
  });

  it("enables Restaurar padrão once a filter differs", () => {
    expect(find(gridMenu(explore({ filtersDefault: false }), deps()), "Restaurar padrão").enabled).toBe(true);
  });
});

describe("server menus", () => {
  const local: MenuServer = { id: "a", address: "192.168.1.20:9001", isLocal: true, manual: false, active: true };
  const other: MenuServer = { id: "b", address: "192.168.1.34:9001", isLocal: false, manual: false, active: false };
  const remote: MenuServer = { id: "c", address: "bot.exemplo.com:443", isLocal: false, manual: true, active: false };

  const connected = (patch: Partial<MenuState> = {}) =>
    state({
      activeAddress: local.address,
      activeIsLocal: true,
      servers: [local, other, remote],
      botConnected: true,
      botChannel: "Servidor de casa · #geral",
      ...patch
    });

  it("names the server, then the bot's channel, as disabled rows", () => {
    const menu = serverMenu(connected(), deps());

    expect(labels(menu).slice(0, 2)).toEqual(["192.168.1.20:9001 · este computador", "Servidor de casa · #geral"]);
    expect(menu[0].enabled).toBe(false);
    expect(menu[1].enabled).toBe(false);
    expect(labels(menu)).toEqual([
      "192.168.1.20:9001 · este computador",
      "Servidor de casa · #geral",
      "-",
      "Trocar de servidor",
      "Copiar endereço",
      "Procurar novamente",
      "Adicionar servidor…"
    ]);
  });

  it("says the bot is out of a channel only when it is known to be", () => {
    expect(labels(serverMenu(connected({ botConnected: false, botChannel: null }), deps()))[1]).toBe(
      "Bot fora de um canal de voz"
    );
    expect(labels(serverMenu(connected({ botConnected: null, botChannel: null }), deps()))).not.toContain(
      "Bot fora de um canal de voz"
    );
    // A silent server shows no bot line at all.
    expect(labels(serverMenu(connected({ healthy: false, botConnected: false }), deps()))).not.toContain(
      "Bot fora de um canal de voz"
    );
  });

  it("with no active server: one header, then search and add, nothing to switch or copy", () => {
    const menu = serverMenu(state(), deps());

    expect(labels(menu)).toEqual(["Nenhum servidor encontrado", "-", "Procurar novamente", "Adicionar servidor…"]);
  });

  it("switches from the discovered list, then the remote ones, the active one ticked", () => {
    const d = deps();
    const switcher = find(serverMenu(connected(), d), "Trocar de servidor").submenu as Item[];

    expect(labels(switcher)).toEqual([
      "Rede local",
      "192.168.1.20:9001",
      "192.168.1.34:9001",
      "-",
      "Remoto",
      "bot.exemplo.com:443"
    ]);
    expect(switcher.filter((i) => i.type === "radio").map((i) => i.checked)).toEqual([true, false, false]);

    (switcher[2].click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "server-select", id: "b" });
  });

  it("copies the active address", () => {
    const d = deps();
    (find(serverMenu(connected(), d), "Copiar endereço").click as () => void)();
    expect(d.copy).toHaveBeenCalledWith("192.168.1.20:9001");
  });

  it("a discovered row: use and copy; a remote one adds test and remove", () => {
    expect(labels(serverRowMenu(other, deps()))).toEqual(["Usar este servidor", "Copiar endereço"]);
    expect(find(serverRowMenu(local, deps()), "Usar este servidor").enabled).toBe(false);

    const d = deps();
    const menu = serverRowMenu(remote, d);
    expect(labels(menu)).toEqual(["Usar este servidor", "Copiar endereço", "-", "Testar conexão", "Remover servidor"]);

    (find(menu, "Remover servidor").click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "server-remove", id: "c" });
  });
});

describe("text field menu", () => {
  const params = { misspelledWord: "", dictionarySuggestions: [] as string[], isSearch: false };

  it("is the edit menu, with spelling first when a word is misspelled", () => {
    const replace = vi.fn();
    const menu = fieldMenu({ ...params, misspelledWord: "instnte", dictionarySuggestions: ["instante", "instant"] }, { hasQuery: false }, deps(), replace);

    expect(labels(menu)).toEqual([
      "instante",
      "instant",
      "-",
      "Desfazer",
      "Refazer",
      "-",
      "Recortar",
      "Copiar",
      "Colar",
      "Selecionar tudo"
    ]);

    (menu[0].click as () => void)();
    expect(replace).toHaveBeenCalledWith("instante");
  });

  it("adds Limpar busca only in the search field, and only with a query", () => {
    const d = deps();
    const withQuery = fieldMenu({ ...params, isSearch: true }, { hasQuery: true }, d, vi.fn());
    expect(labels(withQuery).at(-1)).toBe("Limpar busca");
    (withQuery.at(-1)!.click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "clear-search" });

    expect(labels(fieldMenu({ ...params, isSearch: true }, { hasQuery: false }, deps(), vi.fn()))).not.toContain("Limpar busca");
    expect(labels(fieldMenu(params, { hasQuery: true }, deps(), vi.fn()))).not.toContain("Limpar busca");
  });
});

describe("menu bar", () => {
  const env = { isDev: false, appName: "Peace Breaker Bot", checkForUpdates: vi.fn() };
  const top = (platform: string, patch: Partial<MenuState> = {}, dev = false) =>
    menuBar(state(patch), deps(platform), { ...env, isDev: dev });
  const sub = (items: Item[], label: string) => find(items, label).submenu as Item[];

  it("macOS: app menu, Arquivo, Editar, Visualizar, Reprodução, Servidor, Janela, Ajuda", () => {
    expect(labels(top("darwin"))).toEqual([
      "Peace Breaker Bot",
      "Arquivo",
      "Editar",
      "Visualizar",
      "Reprodução",
      "Servidor",
      "Janela",
      "Ajuda"
    ]);
  });

  it("Windows and Linux have no app menu", () => {
    expect(labels(top("win32"))[0]).toBe("Arquivo");
    expect(labels(top("linux"))).not.toContain("Peace Breaker Bot");
  });

  it("puts Sobre, updates, Aparência and Idioma in the app menu on macOS, and moves them elsewhere otherwise", () => {
    const app = sub(top("darwin"), "Peace Breaker Bot");
    expect(labels(app).slice(0, 5)).toEqual(["Sobre o Peace Breaker Bot", "Verificar atualizações…", "-", "Aparência…", "Idioma"]);
    expect(find(app, "Aparência…").accelerator).toBe("CmdOrCtrl+,");

    const win = top("win32");
    expect(labels(sub(win, "Arquivo"))).toContain("Aparência…");
    expect(labels(sub(win, "Arquivo"))).toContain("Sair");
    expect(labels(sub(win, "Visualizar"))).toContain("Idioma");
    expect(labels(sub(win, "Ajuda"))).toEqual(
      expect.arrayContaining(["Sobre o Peace Breaker Bot", "Verificar atualizações…"])
    );
  });

  it("registers only Cmd/Ctrl + key accelerators, never with Alt or Shift", () => {
    const accelerators: string[] = [];
    const walk = (items: Item[]) =>
      items.forEach((item) => {
        if (item.accelerator && item.registerAccelerator !== false) accelerators.push(String(item.accelerator));
        if (Array.isArray(item.submenu)) walk(item.submenu);
      });

    for (const platform of ["darwin", "win32", "linux"]) {
      accelerators.length = 0;
      walk(top(platform, { hasFavorites: true, tab: "explore" }, false));
      expect(accelerators.sort()).toEqual(["CmdOrCtrl+,", "CmdOrCtrl+1", "CmdOrCtrl+2", "CmdOrCtrl+F", "CmdOrCtrl+N", "CmdOrCtrl+R"]);
      expect(accelerators.every((a) => /^CmdOrCtrl\+[^+]+$/.test(a))).toBe(true);
    }
  });

  it("gives Organizar favoritos and Procurar novamente no shortcut", () => {
    const view = sub(top("darwin", { hasFavorites: true }), "Visualizar");
    expect(find(view, "Organizar favoritos").accelerator).toBeUndefined();
    expect(find(sub(top("darwin"), "Servidor"), "Procurar novamente").accelerator).toBeUndefined();
  });

  it("shows Esc on Parar reprodução without registering it, and puts it in the label off macOS", () => {
    const mac = find(sub(top("darwin", { playing: "local" }), "Reprodução"), "Parar reprodução");
    expect(mac).toMatchObject({ accelerator: "Esc", registerAccelerator: false, enabled: true });

    const win = sub(top("win32", { playing: "local" }), "Reprodução")[0];
    expect(win.accelerator).toBeUndefined();
    expect(win.label).toBe("Parar reprodução (Esc)");

    expect(sub(top("darwin"), "Reprodução")[0].enabled).toBe(false);
  });

  it("Reprodução: card items follow focus, and Enviar is off only for a known-away bot", () => {
    const items = (patch: Partial<MenuState>) => sub(top("darwin", patch), "Reprodução");

    expect(find(items({}), "Tocar no cartão em foco").enabled).toBe(false);
    expect(find(items({ focusedCard: true }), "Tocar no cartão em foco").enabled).toBe(true);
    expect(find(items({ focusedCard: true, botConnected: null }), "Enviar cartão em foco ao Discord").enabled).toBe(true);
    expect(find(items({ focusedCard: true, botConnected: false }), "Enviar cartão em foco ao Discord").enabled).toBe(false);
    expect(find(items({ focusedCard: true }), "Tocar no cartão em foco").registerAccelerator).toBe(false);
  });

  it("mirrors the global keys switch and offers the OS's own modifier presets", () => {
    const d = deps("win32");
    const bar = menuBar(state({ globalKeys: { available: true, enabled: true, modifier: "ctrl-shift" } }), d, env);
    const playback = sub(bar, "Reprodução");

    expect(find(playback, "Teclas globais")).toMatchObject({ type: "checkbox", checked: true });
    (find(playback, "Teclas globais").click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "global-enabled", enabled: false });

    const presets = sub(playback, "Modificador");
    expect(presets.map((p) => [p.label, p.checked])).toEqual([
      ["Ctrl+Alt+Shift", false],
      ["Ctrl+Shift", true],
      ["Ctrl+Alt", false]
    ]);
    (presets[0].click as () => void)();
    expect(d.send).toHaveBeenCalledWith({ type: "global-modifier", modifier: "ctrl-alt-shift" });

    const off = sub(top("win32"), "Reprodução");
    expect(find(off, "Teclas globais").enabled).toBe(false);
  });

  it("Visualizar: the tabs are checks, and reload is Explorar's", () => {
    const view = (tab: "favorites" | "explore") => sub(top("darwin", { tab, hasFavorites: true }), "Visualizar");

    expect(find(view("explore"), "Explorar").checked).toBe(true);
    expect(find(view("explore"), "Favoritos").checked).toBe(false);
    expect(find(view("explore"), "Recarregar listagem").enabled).toBe(true);
    expect(find(view("favorites"), "Recarregar listagem").enabled).toBe(false);
    expect(find(view("explore"), "Organizar favoritos").enabled).toBe(false);
    expect(find(view("favorites"), "Organizar favoritos").enabled).toBe(true);
  });

  it("keeps reload and developer tools only in development, off Ctrl+R", () => {
    expect(labels(sub(top("darwin"), "Visualizar"))).not.toContain("Ferramentas do desenvolvedor");

    const dev = sub(top("darwin", {}, true), "Visualizar");
    expect(labels(dev)).toEqual(expect.arrayContaining(["Recarregar (só em desenvolvimento)", "Ferramentas do desenvolvedor"]));
    expect(find(dev, "Recarregar (só em desenvolvimento)").accelerator).toBe("F5");
  });

  it("Servidor lists the discovered servers as radios, with the same helpers as the chip", () => {
    const servers: MenuServer[] = [
      { id: "a", address: "192.168.1.20:9001", isLocal: true, manual: false, active: true },
      { id: "b", address: "192.168.1.34:9001", isLocal: false, manual: false, active: false }
    ];
    const menu = sub(top("darwin", { servers, activeAddress: "192.168.1.20:9001", activeIsLocal: true }), "Servidor");

    expect(menu.filter((i) => i.type === "radio").map((i) => [i.label, i.checked])).toEqual([
      ["192.168.1.20:9001", true],
      ["192.168.1.34:9001", false]
    ]);
    expect(labels(menu)).toEqual(
      expect.arrayContaining(["Procurar novamente", "Adicionar servidor…", "Copiar endereço do servidor"])
    );
  });

  it("Ajuda: shortcuts with ?, and the two links, https only", () => {
    const d = deps("darwin");
    const help = sub(menuBar(state(), d, env), "Ajuda");

    expect(find(help, "Atalhos de teclado…")).toMatchObject({ accelerator: "?", registerAccelerator: false });
    (find(help, "Repositório no GitHub").click as () => void)();
    (find(help, "Relatar um problema").click as () => void)();
    for (const [url] of d.openExternal.mock.calls) {
      expect(url).toMatch(/^https:\/\/github\.com\/pinheirolucas\/peace-breaker-bot-desktop/);
    }
    expect(d.openExternal).toHaveBeenCalledTimes(2);
  });

  it("follows the in-app language", () => {
    expect(labels(menuBar(state({ language: "en-US" }), deps("darwin", "en-US"), env))).toEqual([
      "Peace Breaker Bot",
      "File",
      "Edit",
      "View",
      "Playback",
      "Server",
      "Window",
      "Help"
    ]);
  });
});
