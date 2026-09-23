// Pure builders for every native menu: the card, the free grid area, the
// server chip and its rows, text fields, and the menu bar. They take the
// state the renderer reported and the effects to run (send a command, copy,
// open a link) and return Electron templates, so each is testable without
// Electron. Only main.ts imports this; the preload never does.

import type { MenuItemConstructorOptions } from "electron";
import { httpsUrl } from "./menuState";
import type { CardContext, MenuCommand, MenuServer, MenuState } from "./menuState";
import { modifierLabel, modifiersFor } from "./shortcuts";
import type { Translate } from "./menuI18n";

export type Item = MenuItemConstructorOptions;

export interface MenuDeps {
  t: Translate;
  platform: string;
  send: (command: MenuCommand) => void;
  copy: (text: string) => void;
  openExternal: (url: string) => void;
  /** Shows the clip's file in the file manager, preparing it first. */
  reveal: (request: { name: string; url: string }) => void;
}

export const repoUrl = "https://github.com/pinheirolucas/peace-breaker-bot-desktop";
export const issuesUrl = `${repoUrl}/issues/new`;

const separator: Item = { type: "separator" };

/** A key shown on a row of a popup menu. Nothing is registered: popups only display it. */
function shown(label: string, accelerator: string | undefined, extra: Item = {}): Item {
  return accelerator
    ? { label, accelerator, registerAccelerator: false, ...extra }
    : { label, ...extra };
}

/** The same for the menu bar. Off macOS an accelerator would be registered whatever registerAccelerator says, and would steal Esc from a dialog, so the key goes in the label. */
function shownInBar(platform: string, label: string, accelerator: string, extra: Item = {}): Item {
  return platform === "darwin"
    ? shown(label, accelerator, extra)
    : { label: `${label} (${accelerator})`, ...extra };
}

function group(...groups: Item[][]): Item[] {
  return groups
    .filter((items) => items.length > 0)
    .flatMap((items, index) => (index === 0 ? items : [separator, ...items]));
}

// ---- card ----

export function cardMenu(ctx: CardContext, { t, send, copy, openExternal, reveal }: MenuDeps): Item[] {
  const act = (action: Parameters<typeof cardCommand>[1]) => () => send(cardCommand(ctx, action));
  const clipKey = ctx.key?.toUpperCase();
  const favorites = ctx.surface === "favorites";
  const site = httpsUrl(ctx.url);
  const { state } = ctx;

  const links: Item[] = [
    { label: t("menu.card.copyLink"), click: () => copy(ctx.url) },
    { label: t("menu.card.reveal"), click: () => reveal({ name: ctx.name, url: ctx.url }) },
    {
      label: favorites ? t("menu.card.open") : t("menu.card.openIn", { provider: ctx.providerName }),
      enabled: site !== null,
      click: () => site && openExternal(site)
    }
  ];

  if (ctx.organizing) {
    return group(
      [
        { label: t("menu.card.rename"), click: act("rename") },
        shown(t("menu.card.setKey"), clipKey, { click: act("set-key") })
      ],
      [
        { label: t("menu.card.moveStart"), enabled: ctx.index > 0, click: act("move-start") },
        { label: t("menu.card.moveEnd"), enabled: ctx.index < ctx.total - 1, click: act("move-end") }
      ],
      links,
      [{ label: t("menu.card.remove"), enabled: !state.trailDisabled, click: act("remove") }]
    );
  }

  // Order: play, links, housekeeping. The first group is cardState, verbatim.
  const play: Item[] = [];

  if (ctx.playback !== "idle") {
    play.push(
      shown(
        ctx.playback === "discord" ? t("menu.card.stopDiscord") : t("menu.card.stop"),
        "Esc",
        { enabled: !state.stopDisabled, click: act("stop") }
      )
    );
  }

  play.push(
    shown(
      ctx.playback === "local" ? t("menu.card.playAgain") : t("menu.card.play"),
      clipKey && `Shift+${clipKey}`,
      { enabled: !state.playDisabled, click: act("play") }
    )
  );

  if (ctx.playback !== "discord") {
    play.push(
      shown(t("menu.card.discord"), clipKey, {
        enabled: !state.discordDisabled,
        sublabel: state.botGated ? t("menu.card.botAway") : undefined,
        click: act("discord")
      })
    );
  }

  const housekeeping: Item[] = favorites
    ? [
        { label: t("menu.card.rename"), click: act("rename") },
        { label: t("menu.card.remove"), enabled: !state.trailDisabled, click: act("remove") }
      ]
    : [];

  if (!favorites) {
    return group(
      play,
      [
        {
          label: ctx.favorite ? t("menu.card.removeFavorite") : t("menu.card.addFavorite"),
          enabled: !state.trailDisabled,
          click: act("toggle-favorite")
        }
      ],
      links
    );
  }

  return group(play, links, housekeeping);
}

function cardCommand(ctx: CardContext, action: Extract<MenuCommand, { type: "card" }>["action"]): MenuCommand {
  return { type: "card", surface: ctx.surface, action, url: ctx.url, width: ctx.width };
}

// ---- free grid area, and the shared Site / Região submenus ----

function siteItems(state: MenuState, { t, send }: MenuDeps): Item[] {
  return (state.providers ?? []).map((provider) => ({
    label: provider.name,
    type: "radio" as const,
    checked: provider.key === state.provider,
    click: () => send({ type: "provider", key: provider.key })
  }));
}

function regionItems(state: MenuState, { send }: MenuDeps): Item[] {
  return state.regions.map((region) => ({
    label: region.label,
    type: "radio" as const,
    checked: region.code === state.region,
    click: () => send({ type: "region", region: region.code })
  }));
}

/** Site ▸, Região ▸ (only when the site has regions) and the way back to the defaults. */
function filterItems(state: MenuState, deps: MenuDeps): Item[] {
  const { t, send } = deps;
  const sites = siteItems(state, deps);
  const regions = regionItems(state, deps);

  return group(
    [
      ...(sites.length > 0 ? [{ label: t("menu.view.site"), submenu: sites }] : []),
      ...(state.regionSupported && regions.length > 0
        ? [{ label: t("menu.view.region"), submenu: regions }]
        : [])
    ],
    [{ label: t("menu.view.resetFilters"), enabled: !state.filtersDefault, click: () => send({ type: "reset-filters" }) }]
  );
}

function organizeItem(state: MenuState, { t, send }: MenuDeps): Item {
  const blocked = state.organizeBlocked;
  return {
    label: t("menu.grid.organize"),
    enabled: blocked === null && !state.organizing,
    sublabel:
      blocked === "playing"
        ? t("favorites.organizeBlockedPlaying")
        : blocked === "search"
          ? t("favorites.organizeBlockedSearch")
          : undefined,
    click: () => send({ type: "organize" })
  };
}

/** Empty means no menu at all (Organizar has nothing page-level to offer). */
export function gridMenu(state: MenuState, deps: MenuDeps): Item[] {
  const { t, send, platform } = deps;
  const mod = platform === "darwin" ? "Cmd" : "Ctrl";

  if (state.tab === "explore") {
    return group(
      [shown(t("menu.view.reload"), `${mod}+R`, { click: () => send({ type: "reload" }) })],
      filterItems(state, deps)
    );
  }

  if (state.organizing) return [];

  return group(
    [
      shown(t("menu.file.add"), `${mod}+N`, { click: () => send({ type: "add" }) }),
      ...(state.hasFavorites ? [organizeItem(state, deps)] : [])
    ],
    [
      { label: t("menu.file.import"), click: () => send({ type: "import" }) },
      ...(state.hasFavorites ? [{ label: t("menu.file.export"), click: () => send({ type: "export" }) }] : [])
    ]
  );
}

// ---- server ----

function serverHeader(state: MenuState, { t }: MenuDeps): Item[] {
  if (!state.activeAddress) {
    return [{ label: t("server.none"), enabled: false }];
  }

  const rows: Item[] = [
    {
      label: state.activeIsLocal
        ? `${state.activeAddress} · ${t("server.thisComputer")}`
        : state.activeAddress,
      enabled: false
    }
  ];

  if (state.healthy && state.botConnected === false) {
    rows.push({ label: t("menu.server.botAway"), enabled: false });
  } else if (state.healthy && state.botConnected && state.botChannel) {
    rows.push({ label: state.botChannel, enabled: false });
  }

  return rows;
}

/** The discovered servers first, then the ones added by hand, the current one ticked. */
function serverChoices(state: MenuState, { t, send }: MenuDeps): Item[] {
  const row = (server: MenuServer): Item => ({
    label: server.address,
    type: "radio",
    checked: server.active,
    click: () => send({ type: "server-select", id: server.id })
  });
  const local = state.servers.filter((server) => !server.manual);
  const remote = state.servers.filter((server) => server.manual);

  return group(
    local.length > 0 ? [{ label: t("server.localNetwork"), enabled: false }, ...local.map(row)] : [],
    remote.length > 0 ? [{ label: t("server.remote"), enabled: false }, ...remote.map(row)] : []
  );
}

export function serverMenu(state: MenuState, deps: MenuDeps): Item[] {
  const { t, send, copy } = deps;
  const address = state.activeAddress;

  return group(
    serverHeader(state, deps),
    [
      ...(state.servers.length > 0
        ? [{ label: t("menu.server.switch"), submenu: serverChoices(state, deps) }]
        : []),
      ...(address ? [{ label: t("menu.server.copy"), click: () => copy(address) }] : []),
      { label: t("menu.server.refresh"), click: () => send({ type: "server-refresh" }) },
      { label: t("menu.server.add"), click: () => send({ type: "add-server" }) }
    ]
  );
}

/** A row of the picker. Test and Remove exist only for servers added by hand, as on their row buttons. */
export function serverRowMenu(server: MenuServer, { t, send, copy }: MenuDeps): Item[] {
  return group(
    [
      { label: t("menu.row.use"), enabled: !server.active, click: () => send({ type: "server-select", id: server.id }) },
      { label: t("menu.server.copy"), click: () => copy(server.address) }
    ],
    server.manual
      ? [
          { label: t("menu.row.test"), click: () => send({ type: "server-test", id: server.id }) },
          { label: t("menu.row.remove"), click: () => send({ type: "server-remove", id: server.id }) }
        ]
      : []
  );
}

// ---- text fields, and selected text ----

export interface FieldParams {
  misspelledWord: string;
  dictionarySuggestions: string[];
  /** The search field is the one that offers Limpar busca. */
  isSearch: boolean;
}

export function fieldMenu(
  params: FieldParams,
  state: Pick<MenuState, "hasQuery">,
  { t, send }: MenuDeps,
  replaceMisspelling: (word: string) => void
): Item[] {
  const suggestions: Item[] = params.misspelledWord
    ? params.dictionarySuggestions.slice(0, 5).map((word) => ({
        label: word,
        click: () => replaceMisspelling(word)
      }))
    : [];

  return group(
    suggestions,
    [
      { role: "undo", label: t("menu.edit.undo") },
      { role: "redo", label: t("menu.edit.redo") }
    ],
    [
      { role: "cut", label: t("menu.edit.cut") },
      { role: "copy", label: t("menu.edit.copy") },
      { role: "paste", label: t("menu.edit.paste") },
      { role: "selectAll", label: t("menu.edit.selectAll") }
    ],
    params.isSearch && state.hasQuery
      ? [{ label: t("common.clearSearch"), click: () => send({ type: "clear-search" }) }]
      : []
  );
}

export function selectionMenu({ t }: MenuDeps): Item[] {
  return [{ role: "copy", label: t("menu.edit.copy") }];
}

// ---- the menu bar ----

export interface BarEnv {
  isDev: boolean;
  appName: string;
  checkForUpdates: () => void;
}

function languageItems(state: MenuState, { t, send }: MenuDeps): Item[] {
  return [
    { label: t("app.languagePtBR"), type: "radio", checked: state.language === "pt-BR", click: () => send({ type: "language", language: "pt-BR" }) },
    { label: t("app.languageEnUS"), type: "radio", checked: state.language === "en-US", click: () => send({ type: "language", language: "en-US" }) }
  ];
}

export function menuBar(state: MenuState, deps: MenuDeps, env: BarEnv): Item[] {
  const { t, send, copy, openExternal, platform } = deps;
  const mac = platform === "darwin";
  const editing = state.organizing;

  const about: Item = { role: "about", label: t("menu.app.about", { name: env.appName }) };
  const updates: Item = { label: t("menu.app.checkForUpdates"), click: env.checkForUpdates };
  const appearance: Item = {
    label: t("menu.app.appearance"),
    accelerator: "CmdOrCtrl+,",
    click: () => send({ type: "appearance" })
  };
  const language: Item = { label: t("menu.app.language"), submenu: languageItems(state, deps) };

  const appMenu: Item[] = mac
    ? [
        {
          label: env.appName,
          submenu: [
            about,
            updates,
            separator,
            appearance,
            language,
            separator,
            { role: "services", label: t("menu.app.services") },
            separator,
            { role: "hide", label: t("menu.app.hide", { name: env.appName }) },
            { role: "hideOthers", label: t("menu.app.hideOthers") },
            { role: "unhide", label: t("menu.app.showAll") },
            separator,
            { role: "quit", label: t("menu.app.quit", { name: env.appName }) }
          ]
        }
      ]
    : [];

  const file: Item = {
    label: t("menu.file.title"),
    submenu: [
      { label: t("menu.file.add"), accelerator: "CmdOrCtrl+N", enabled: !editing, click: () => send({ type: "add" }) },
      { label: t("menu.file.addServer"), click: () => send({ type: "add-server" }) },
      separator,
      { label: t("menu.file.import"), click: () => send({ type: "import" }) },
      { label: t("menu.file.export"), enabled: state.hasFavorites, click: () => send({ type: "export" }) },
      separator,
      ...(mac
        ? [{ role: "close" as const, label: t("menu.file.close") }]
        : [appearance, separator, { role: "quit" as const, label: t("menu.file.quit") }])
    ]
  };

  const edit: Item = {
    label: t("menu.edit.title"),
    submenu: [
      { role: "undo", label: t("menu.edit.undo") },
      { role: "redo", label: t("menu.edit.redo") },
      separator,
      { role: "cut", label: t("menu.edit.cut") },
      { role: "copy", label: t("menu.edit.copy") },
      { role: "paste", label: t("menu.edit.paste") },
      { role: "selectAll", label: t("menu.edit.selectAll") }
    ]
  };

  const view: Item = {
    label: t("menu.view.title"),
    submenu: [
      { label: t("app.tabFavorites"), type: "checkbox", checked: state.tab === "favorites", accelerator: "CmdOrCtrl+1", click: () => send({ type: "tab", tab: "favorites" }) },
      { label: t("app.tabExplore"), type: "checkbox", checked: state.tab === "explore", accelerator: "CmdOrCtrl+2", click: () => send({ type: "tab", tab: "explore" }) },
      separator,
      { label: t("menu.view.find"), accelerator: "CmdOrCtrl+F", click: () => send({ type: "find" }) },
      {
        ...organizeItem(state, deps),
        label: t("menu.grid.organize"),
        enabled: state.tab === "favorites" && state.hasFavorites && state.organizeBlocked === null && !state.organizing
      },
      { label: t("menu.view.reload"), accelerator: "CmdOrCtrl+R", enabled: state.tab === "explore", click: () => send({ type: "reload" }) },
      separator,
      ...filterItems(state, deps),
      ...(mac ? [] : [separator, { label: t("menu.app.language"), submenu: languageItems(state, deps) }]),
      separator,
      { role: "togglefullscreen", label: t("menu.view.fullscreen") },
      // Dev only, and off the accelerators the app owns (Ctrl+R is Recarregar listagem).
      ...(env.isDev
        ? [
            separator,
            { role: "reload" as const, label: t("menu.view.devReload"), accelerator: "F5" },
            { role: "toggleDevTools" as const, label: t("menu.view.devTools"), accelerator: "F12" }
          ]
        : [])
    ]
  };

  const modifiers = state.globalKeys.available ? modifiersFor(platform) : [];
  const playback: Item = {
    label: t("menu.playback.title"),
    submenu: [
      shownInBar(platform, t("menu.playback.stop"), "Esc", { enabled: state.playing !== null, click: () => send({ type: "stop" }) }),
      separator,
      shownInBar(platform, t("menu.playback.playFocused"), "Enter", { enabled: state.focusedCard && !editing, click: () => send({ type: "play-focused" }) }),
      shownInBar(platform, t("menu.playback.sendFocused"), "Shift+Enter", {
        enabled: state.focusedCard && !editing && state.botConnected !== false,
        click: () => send({ type: "send-focused" })
      }),
      separator,
      {
        label: t("menu.playback.globalKeys"),
        type: "checkbox",
        checked: state.globalKeys.enabled,
        enabled: state.globalKeys.available,
        click: () => send({ type: "global-enabled", enabled: !state.globalKeys.enabled })
      },
      {
        label: t("menu.playback.globalModifier"),
        enabled: state.globalKeys.available,
        submenu: modifiers.map((modifier) => ({
          label: modifierLabel(platform, modifier),
          type: "radio" as const,
          checked: modifier === state.globalKeys.modifier,
          click: () => send({ type: "global-modifier", modifier })
        }))
      }
    ]
  };

  const server: Item = {
    label: t("menu.server.title"),
    submenu: group(
      serverHeader(state, deps),
      serverChoices(state, deps),
      [
        { label: t("menu.server.refresh"), click: () => send({ type: "server-refresh" }) },
        { label: t("menu.server.add"), click: () => send({ type: "add-server" }) },
        {
          label: t("menu.server.copyAddress"),
          enabled: state.activeAddress !== null,
          click: () => state.activeAddress && copy(state.activeAddress)
        }
      ]
    )
  };

  const windowMenu: Item = {
    label: t("menu.window.title"),
    role: "window",
    submenu: [
      { role: "minimize", label: t("menu.window.minimize") },
      { role: "zoom", label: t("menu.window.zoom") },
      ...(mac ? [separator, { role: "front" as const, label: t("menu.window.front") }] : [])
    ]
  };

  const help: Item = {
    label: t("menu.help.title"),
    role: "help",
    submenu: [
      shownInBar(platform, t("menu.help.shortcuts"), "?", { click: () => send({ type: "shortcuts" }) }),
      separator,
      ...(mac ? [] : [about, updates, separator]),
      { label: t("menu.help.repo"), click: () => openExternal(repoUrl) },
      { label: t("menu.help.report"), click: () => openExternal(issuesUrl) }
    ]
  };

  return [...appMenu, file, edit, view, playback, server, windowMenu, help];
}

/** The state main starts from, before the renderer has reported any. */
export function initialMenuState(language: MenuState["language"]): MenuState {
  return {
    tab: "favorites",
    playing: null,
    botConnected: null,
    botChannel: null,
    healthy: true,
    organizing: false,
    hasFavorites: false,
    hasQuery: false,
    organizeBlocked: null,
    focusedCard: false,
    blocked: false,
    language,
    activeAddress: null,
    activeIsLocal: false,
    servers: [],
    providers: null,
    provider: null,
    regionSupported: false,
    region: "br",
    regions: [],
    filtersDefault: true,
    globalKeys: { available: false, enabled: false, modifier: null }
  };
}
