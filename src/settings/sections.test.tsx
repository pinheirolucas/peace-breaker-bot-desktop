import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "../../electron/discovery";
import { defaultPresenceSettings } from "../../electron/presence";
import type { PresenceSettings } from "../../electron/presence";
import i18n from "../i18n";
import { resetSettings, settingsKeys } from "../storage";
import { DataPane } from "./DataSection";
import { ExplorePane } from "./ExploreSection";
import GeneralSection, { GeneralPane } from "./GeneralSection";
import KeysSection, { KeysPane } from "./KeysSection";
import PresenceSection, { PresencePane } from "./PresenceSection";
import { ServerPane } from "./ServerSection";
import type { ServerPaneProps } from "./ServerSection";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  window.localStorage.clear();
});

afterEach(() => {
  for (const name of ["instantsPlatform", "instantsShortcuts", "instantsQuickAccess", "instantsPresence", "instantsSettings", "instantsUpdates"] as const) {
    delete window[name];
  }
});

const mac = (id: string, patch: Partial<Server> = {}): Server => ({
  id,
  apiUrl: `http://${id}:9001/api/v1`,
  address: id,
  port: 9001,
  hostname: `${id}.local`,
  isLocal: false,
  ...patch
});

describe("Geral", () => {
  function pane(patch: Partial<React.ComponentProps<typeof GeneralPane>> = {}) {
    const props = { language: "auto" as const, onLanguage: vi.fn(), version: "0.1.15", update: { state: "idle" as const }, canCheck: true, onCheck: vi.fn(), ...patch };
    render(<GeneralPane {...props} />);
    return props;
  }

  it("offers the language as automatic, Portuguese or English, the current one checked", async () => {
    const props = pane({ language: "pt-BR" });

    const group = within(screen.getByRole("radiogroup", { name: "Idioma da interface" }));
    expect(group.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Automático", "Português (Brasil)", "English"]);
    expect(group.getByRole("radio", { name: "Português (Brasil)" })).toBeChecked();

    await userEvent.click(group.getByRole("radio", { name: "English" }));
    expect(props.onLanguage).toHaveBeenCalledWith("en-US");
  });

  it("names the version and checks on request", async () => {
    const props = pane();

    expect(screen.getByText("Versão 0.1.15")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Verificar agora" }));

    expect(props.onCheck).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ state: "checking" as const }, "Verificando…"],
    [{ state: "upToDate" as const }, "Você já está na versão mais recente."],
    [{ state: "available" as const, version: "0.2.0" }, "A versão 0.2.0 está disponível."],
    [{ state: "failed" as const }, "Não foi possível verificar atualizações."]
  ])("says how a check ended: %j", (update, text) => {
    pane({ update });

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("disables the button while checking, and where there is no updater to ask", () => {
    pane({ update: { state: "checking" } });
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
  });

  it("says why there is no check outside the installed app", () => {
    pane({ canCheck: false });

    expect(screen.getByRole("button", { name: "Verificar agora" })).toBeDisabled();
    expect(screen.getByText("As atualizações só funcionam no aplicativo instalado.")).toBeInTheDocument();
  });

  describe("wired to storage", () => {
    it("writes the language, and Automático removes the key rather than storing the word", async () => {
      const user = userEvent.setup();
      render(<GeneralSection />);

      await user.click(screen.getByRole("radio", { name: "English" }));
      expect(JSON.parse(localStorage.getItem("language")!)).toBe("en-US");

      await user.click(screen.getByRole("radio", { name: "Automático" }));
      expect(localStorage.getItem("language")).toBeNull();
      expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked();
    });

    it("reads an explicit language back", () => {
      localStorage.setItem("language", JSON.stringify("pt-BR"));
      render(<GeneralSection />);

      expect(screen.getByRole("radio", { name: "Português (Brasil)" })).toBeChecked();
    });

    it("asks the updater, and shows what it answers to this window", async () => {
      let notAvailable: (() => void) | undefined;
      const checkNow = vi.fn();
      window.instantsUpdates = {
        onAvailable: () => () => undefined,
        onDownloaded: () => () => undefined,
        onRestartReady: () => () => undefined,
        onNotAvailable: (listener) => {
          notAvailable = listener;
          return () => undefined;
        },
        onCheckFailed: () => () => undefined,
        openReleasePage: vi.fn(),
        openUpdate: vi.fn(),
        restart: vi.fn(),
        checkNow
      };

      render(<GeneralSection />);
      await userEvent.click(screen.getByRole("button", { name: "Verificar agora" }));

      expect(checkNow).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();

      act(() => notAvailable?.());
      expect(screen.getByText("Você já está na versão mais recente.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Verificar agora" })).toBeEnabled();
    });
  });
});

describe("Servidor", () => {
  const estudio = mac("estudio", { isLocal: true });
  const sala = mac("sala-tv");
  const remote = { ...mac("bot.exemplo.dev"), manual: true as const, hostname: null };

  function pane(patch: Partial<ServerPaneProps> = {}) {
    const props: ServerPaneProps = {
      servers: [estudio, sala],
      activeUrl: estudio.apiUrl,
      healthy: true,
      botStatus: { connected: true, guildName: "Casa", channelName: "geral" },
      scanning: false,
      onSelect: vi.fn(),
      onRescan: vi.fn(),
      onRemove: vi.fn(),
      onAdd: vi.fn(),
      onTest: vi.fn().mockResolvedValue({ connected: true }),
      ...patch
    };
    render(<ServerPane {...props} />);
    return props;
  }

  it("says which server it is connected to, and where the bot is", () => {
    pane();

    const status = within(screen.getByRole("status"));
    expect(status.getByText("Conectado a estudio:9001")).toBeInTheDocument();
    expect(status.getByText("Casa · #geral")).toBeInTheDocument();
    expect(status.queryByRole("button")).toBeNull();
  });

  it("lists the servers as radios, the active one checked and marked as this computer", async () => {
    const props = pane();

    const list = within(screen.getByRole("radiogroup", { name: "Servidor ativo" }));
    expect(list.getAllByRole("radio")).toHaveLength(2);
    expect(list.getByRole("radio", { name: /estudio:9001/ })).toBeChecked();
    expect(list.getByRole("radio", { name: /sala-tv:9001/ })).not.toBeChecked();
    expect(within(list.getByRole("radio", { name: /estudio:9001/ })).getByText("estudio.local · este computador")).toBeInTheDocument();

    await userEvent.click(list.getByRole("radio", { name: /sala-tv:9001/ }));
    expect(props.onSelect).toHaveBeenCalledWith(sala);
  });

  it("removes only a server added by hand", async () => {
    const props = pane({ servers: [estudio, remote] });

    expect(screen.getAllByRole("button", { name: /^Remover/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Remover bot.exemplo.dev:9001" }));

    expect(props.onRemove).toHaveBeenCalledWith(remote);
    expect(screen.getByText("Adicionado à mão")).toBeInTheDocument();
  });

  it("has an empty state that says what to check, and a way to search again", async () => {
    const props = pane({ servers: [], activeUrl: null, botStatus: null });

    // Once in the status block and once as the list's own empty state.
    expect(screen.getAllByText("Nenhum servidor encontrado")).toHaveLength(2);
    expect(screen.getByText(/Confira se o bot está rodando/)).toBeInTheDocument();

    const status = within(screen.getByRole("status"));
    await userEvent.click(status.getByRole("button", { name: "Procurar novamente" }));
    expect(props.onRescan).toHaveBeenCalledTimes(1);
  });

  it("says when the active server is silent, and that the play buttons stay live", () => {
    pane({ healthy: false });

    const status = within(screen.getByRole("status"));
    expect(status.getByText("estudio:9001 não está respondendo")).toBeInTheDocument();
    expect(status.getByText(/Os botões de tocar continuam ativos/)).toBeInTheDocument();
    expect(status.getByRole("button", { name: "Procurar novamente" })).toBeInTheDocument();
  });

  it("says when the bot is out of its channel, on a server that answers", () => {
    pane({ botStatus: { connected: false } });

    expect(within(screen.getByRole("status")).getByText("bot fora de um canal de voz")).toBeInTheDocument();
  });

  it("shows searching, and cannot be asked twice at once", () => {
    pane({ scanning: true });

    expect(screen.getByRole("button", { name: "Procurando…" })).toBeDisabled();
  });

  describe("adding by address", () => {
    it("wants a test to pass before it adds", async () => {
      const user = userEvent.setup();
      const props = pane();

      const add = screen.getByRole("button", { name: "Adicionar" });
      expect(add).toBeDisabled();

      await user.type(screen.getByRole("textbox", { name: "Endereço" }), "10.0.0.9:9001");
      await user.click(screen.getByRole("button", { name: "Testar" }));

      expect(props.onTest).toHaveBeenCalledWith("http://10.0.0.9:9001/api/v1");
      expect(await screen.findByText("Conectado")).toBeInTheDocument();
      expect(add).toBeEnabled();

      await user.click(add);
      expect(props.onAdd).toHaveBeenCalledWith("http://10.0.0.9:9001/api/v1");
      expect(screen.getByRole("textbox", { name: "Endereço" })).toHaveValue("");
    });

    it("undoes the test when the address is edited", async () => {
      const user = userEvent.setup();
      pane();

      await user.type(screen.getByRole("textbox", { name: "Endereço" }), "10.0.0.9:9001");
      await user.click(screen.getByRole("button", { name: "Testar" }));
      await screen.findByText("Conectado");

      await user.type(screen.getByRole("textbox", { name: "Endereço" }), "1");

      expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();
      expect(screen.queryByText("Conectado")).toBeNull();
    });

    it("says an address that does not answer does not", async () => {
      const user = userEvent.setup();
      const props = pane({ onTest: vi.fn().mockRejectedValue(new Error("no")) });

      await user.type(screen.getByRole("textbox", { name: "Endereço" }), "10.0.0.9:9001");
      await user.click(screen.getByRole("button", { name: "Testar" }));

      expect(await screen.findByText("Não foi possível conectar")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();
      expect(props.onAdd).not.toHaveBeenCalled();
    });

    it("rejects what is not an address without asking anyone", async () => {
      const user = userEvent.setup();
      const props = pane();

      await user.type(screen.getByRole("textbox", { name: "Endereço" }), "not a server");
      await user.click(screen.getByRole("button", { name: "Testar" }));

      expect(screen.getByText("Endereço inválido")).toBeInTheDocument();
      expect(props.onTest).not.toHaveBeenCalled();
    });
  });
});

describe("Explorar", () => {
  const providers = [
    { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
    { key: "instantsmeme", name: "Instants.meme", supportsSearch: true, supportsRegion: false }
  ];

  function pane(patch: Partial<React.ComponentProps<typeof ExplorePane>> = {}) {
    const props = {
      providers,
      provider: providers[0],
      onProvider: vi.fn(),
      regionSupported: true,
      region: "br" as const,
      language: "pt-BR",
      onRegion: vi.fn(),
      onReset: vi.fn(),
      ...patch
    };
    render(<ExplorePane {...props} />);
    return props;
  }

  it("lists the sites as radios with what each can do", async () => {
    const props = pane();

    const sites = within(screen.getByRole("radiogroup", { name: "Site do catálogo" }));
    expect(sites.getByRole("radio", { name: /MyInstants/ })).toBeChecked();
    expect(within(sites.getByRole("radio", { name: /MyInstants/ })).getByText("país")).toBeInTheDocument();
    expect(within(sites.getByRole("radio", { name: /Instants\.meme/ })).queryByText("país")).toBeNull();

    await userEvent.click(sites.getByRole("radio", { name: /Instants\.meme/ }));
    expect(props.onProvider).toHaveBeenCalledWith("instantsmeme");
  });

  it("picks a country from the curated list", async () => {
    const props = pane();

    const select = screen.getByRole("combobox", { name: "País do catálogo" });
    expect(select).toHaveValue("br");
    expect(within(select).getAllByRole("option")).toHaveLength(22);

    await userEvent.selectOptions(select, "pt");
    expect(props.onRegion).toHaveBeenCalledWith("pt");
  });

  it("disables the country, with the reason, for a site that has none", () => {
    pane({ provider: providers[1], regionSupported: false });

    expect(screen.getByRole("combobox", { name: "País do catálogo" })).toBeDisabled();
    expect(screen.getByText("Este site não tem catálogo por país.")).toBeInTheDocument();
  });

  it("offers Restaurar padrão only once something differs", async () => {
    const { unmount } = render(<div />);
    unmount();
    const props = pane({ provider: providers[1], regionSupported: false });

    await userEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("disables Restaurar padrão at the defaults", () => {
    pane();

    expect(screen.getByRole("button", { name: "Restaurar padrão" })).toBeDisabled();
  });

  it("offers no list, and says why, while the registry is unknown", () => {
    pane({ providers: null, provider: null });

    expect(screen.getByText("Conecte-se a um servidor para ver os sites disponíveis.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    // Unknown is not "one provider without a country": the country stays open.
    expect(screen.getByRole("combobox", { name: "País do catálogo" })).toBeEnabled();
  });
});

describe("Atalhos", () => {
  function bridges(quickAccess = true) {
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };
    window.instantsShortcuts = { modifiers: ["ctrl-alt-shift", "ctrl-shift", "ctrl-alt"], setGlobal: vi.fn(), onFired: () => () => undefined };
    window.instantsQuickAccess = { action: vi.fn(), setShortcut: vi.fn(), onShown: () => () => undefined };
    if (quickAccess) localStorage.setItem("presence", JSON.stringify({ ...defaultPresenceSettings, tray: true, quickAccess: true }));
  }

  it("switches the global keys and picks their combination, in this OS's own words", async () => {
    bridges();
    const user = userEvent.setup();
    render(<KeysSection />);

    const toggle = screen.getByRole("switch", { name: "Teclas globais" });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(JSON.parse(localStorage.getItem("globalShortcuts")!).enabled).toBe(true);

    const combo = within(screen.getByRole("radiogroup", { name: "Combinação das teclas globais" }));
    expect(combo.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Ctrl+Alt+Shift", "Ctrl+Shift", "Ctrl+Alt"]);
    await user.click(combo.getByRole("radio", { name: "Ctrl+Shift" }));
    expect(JSON.parse(localStorage.getItem("globalShortcuts")!).modifier).toBe("ctrl-shift");
  });

  it("dims the combination until its switch is on", () => {
    bridges();
    render(<KeysSection />);

    expect(screen.getByRole("radiogroup", { name: "Combinação das teclas globais" }).closest(".prefrow")).toHaveAttribute("data-dim");
  });

  it("switches quick access's own shortcut, with the key it is fixed to", async () => {
    bridges();
    const user = userEvent.setup();
    render(<KeysSection />);

    await user.click(screen.getByRole("switch", { name: "Atalho global do acesso rápido" }));
    expect(JSON.parse(localStorage.getItem("quickAccessShortcut")!)).toMatchObject({ enabled: true, modifier: "ctrl-alt-shift" });

    const combo = within(screen.getByRole("radiogroup", { name: "Combinação do acesso rápido" }));
    expect(combo.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Ctrl+Alt+Shift P", "Ctrl+Shift P", "Ctrl+Alt P"]);
  });

  it("disables quick access's shortcut, with the reason, while quick access is off", () => {
    bridges(false);
    render(<KeysSection />);

    expect(screen.getByRole("switch", { name: "Atalho global do acesso rápido" })).toBeDisabled();
    expect(screen.getByText("Ligue o acesso rápido primeiro.")).toBeInTheDocument();
  });

  it("says an in-use combination is in use, and stops saying it once it is changed", async () => {
    bridges();
    let conflict: ((c: "quickAccess") => void) | undefined;
    window.instantsSettings = {
      open: vi.fn(),
      openAppearance: vi.fn(),
      appearanceDone: vi.fn(),
      onSection: () => () => undefined,
      onConflict: (listener) => {
        conflict = listener;
        return () => undefined;
      }
    };
    const user = userEvent.setup();
    render(<KeysSection />);

    expect(screen.queryByRole("alert")).toBeNull();
    act(() => conflict?.("quickAccess"));
    expect(screen.getByRole("alert")).toHaveTextContent("Em uso por outro app. Escolha outra combinação.");

    await user.click(within(screen.getByRole("radiogroup", { name: "Combinação do acesso rápido" })).getByRole("radio", { name: "Ctrl+Shift P" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the conflict state it is given", () => {
    render(
      <KeysPane
        os="win"
        globalKeys={{ available: true, enabled: false, modifier: "ctrl-alt", modifiers: ["ctrl-alt"], setEnabled: vi.fn(), setModifier: vi.fn() }}
        quickAccess={{ available: true, enabled: false, modifier: "ctrl-alt", modifiers: ["ctrl-alt"], set: vi.fn() }}
        quickAccessOn
        conflict
        onClearConflict={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Em uso por outro app");
  });

  it("disables the switches with a reason when there is no Electron to register anything", () => {
    render(<KeysSection />);

    expect(screen.getByRole("switch", { name: "Teclas globais" })).toBeDisabled();
    expect(screen.getAllByText("Só funciona no aplicativo instalado.").length).toBeGreaterThan(0);
  });

  it("lists the in-app keys, read-only, with Ctrl on Windows and ⌘ on macOS", () => {
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };
    const { unmount } = render(<KeysSection />);

    const win = screen.getByRole("heading", { name: "Atalhos" }).parentElement!;
    expect(within(win).getByText("Ctrl+F")).toBeInTheDocument();
    expect(within(win).getByText("Ctrl+,")).toBeInTheDocument();
    unmount();

    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };
    render(<KeysSection />);
    expect(screen.getByText("⌘F")).toBeInTheDocument();
    expect(screen.getByText("⌘,")).toBeInTheDocument();
    expect(screen.getByText("Abrir estas configurações")).toBeInTheDocument();
  });
});

describe("Barra de menus e Bandeja", () => {
  function pane(os: "mac" | "win" | "linux", settings: Partial<PresenceSettings> = {}, patch: Partial<React.ComponentProps<typeof PresencePane>> = {}) {
    const props = {
      os,
      desktop: os === "linux" ? ("kde" as const) : null,
      available: true,
      settings: { ...defaultPresenceSettings, ...settings },
      onChange: vi.fn(),
      onOpenKeys: vi.fn(),
      ...patch
    };
    render(<PresencePane {...props} />);
    return props;
  }

  it("is Barra de menus on macOS, with the name beside the icon and no keep-running switch", () => {
    pane("mac", { tray: true });

    expect(screen.getByRole("heading", { name: "Barra de menus" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mostrar na barra de menus" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Mostrar o nome do som ao lado do ícone" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Continuar rodando ao fechar a janela" })).toBeNull();
  });

  it("is Bandeja elsewhere, with keep-running and no name beside the icon", () => {
    pane("win", { tray: true });

    expect(screen.getByRole("heading", { name: "Bandeja" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mostrar na bandeja" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Continuar rodando ao fechar a janela" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /nome do som/ })).toBeNull();
  });

  it("applies each switch at once, keeping the rest of the settings", async () => {
    const props = pane("win", { tray: true, quickAccessClick: "discord" });

    await userEvent.click(screen.getByRole("switch", { name: "Acesso rápido" }));

    expect(props.onChange).toHaveBeenCalledWith({ ...defaultPresenceSettings, tray: true, quickAccessClick: "discord", quickAccess: true });
  });

  it("dims what depends on the icon, with the reason, and disables it", () => {
    pane("mac");

    const quick = screen.getByRole("switch", { name: "Acesso rápido" });
    expect(quick).toBeDisabled();
    expect(quick.closest(".prefrow")).toHaveAttribute("data-dim");
    expect(screen.getAllByText("Ligue o ícone na barra de menus primeiro.").length).toBeGreaterThan(0);
    expect(screen.getByRole("switch", { name: "Mostrar o nome do som ao lado do ícone" })).toBeDisabled();
  });

  it("names Bandeja in that reason on Windows and Linux", () => {
    pane("linux");

    expect(screen.getAllByText("Ligue o ícone na bandeja primeiro.").length).toBeGreaterThan(0);
  });

  it("dims the style and the click until quick access is on, and the click until the style is Favoritos", () => {
    const { unmount } = render(<div />);
    unmount();
    pane("win", { tray: true, quickAccess: true, quickAccessStyle: "connection" });

    const style = screen.getByRole("radiogroup", { name: "Estilo do acesso rápido" }).closest(".prefrow")!;
    const click = screen.getByRole("radiogroup", { name: "Ao clicar em um som" }).closest(".prefrow")!;
    expect(style).not.toHaveAttribute("data-dim");
    expect(click).toHaveAttribute("data-dim");
  });

  it("chooses the style and what a click does", async () => {
    const props = pane("win", { tray: true, quickAccess: true });

    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Estilo do acesso rápido" })).getByRole("radio", { name: "Conexão" }));
    expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quickAccessStyle: "connection" }));

    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Ao clicar em um som" })).getByRole("radio", { name: "Enviar ao bot" }));
    expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quickAccessClick: "discord" }));
  });

  it("previews the real tray glyph for the state it is in, not the app mark", () => {
    const { container, unmount } = render(<div />);
    unmount();
    pane("mac", { tray: true }, { glyph: "playing" });

    const glyph = document.querySelector(".mbar .tray svg")!;
    // The playing cut is one evenodd path; the connected one is a body and two solid reels.
    expect(glyph.querySelector("path[fill-rule='evenodd']")).not.toBeNull();
    expect(container).toBeDefined();
  });

  it.each([
    ["connected", 2],
    ["idle", 2],
    ["off", 2]
  ] as const)("draws the %s glyph", (state, circles) => {
    pane("mac", { tray: true }, { glyph: state });

    expect(document.querySelectorAll(".mbar .tray svg circle")).toHaveLength(circles);
    expect(!!document.querySelector(".mbar .tray svg mask")).toBe(state === "off");
    expect(!!document.querySelector(".mbar .tray svg circle[r='8.5']")).toBe(state !== "connected");
  });

  it("says a new icon may need pinning on Windows", () => {
    pane("win", { tray: true });

    expect(screen.getByText("Fixe o ícone na barra de tarefas para mantê-lo visível.")).toBeInTheDocument();
  });

  it("says GNOME has no tray icon", () => {
    pane("linux", {}, { desktop: "gnome" });

    expect(screen.getByText(/Sem ícone na bandeja neste ambiente/)).toBeInTheDocument();
  });

  it("points to where quick access's global shortcut is", async () => {
    const props = pane("mac");

    await userEvent.click(screen.getByRole("button", { name: "Atalhos" }));

    expect(props.onOpenKeys).toHaveBeenCalledTimes(1);
  });

  it("disables the icon, with a reason, without the Electron bridge", () => {
    pane("mac", {}, { available: false });

    expect(screen.getByRole("switch", { name: "Mostrar na barra de menus" })).toBeDisabled();
    expect(screen.getByText("Só funciona no aplicativo instalado.")).toBeInTheDocument();
  });

  it("writes the stored settings and reports nothing to the main process", async () => {
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };
    window.instantsPresence = { setServer: vi.fn(), setPlaying: vi.fn(), setSettings: vi.fn(), stop: vi.fn(), onSnapshot: () => () => undefined };
    render(<PresenceSection onOpenKeys={vi.fn()} />);

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar na barra de menus" }));

    expect(JSON.parse(localStorage.getItem("presence")!).tray).toBe(true);
    expect(window.instantsPresence.setSettings).not.toHaveBeenCalled();
  });
});

describe("Dados e backup", () => {
  it("exports and imports, the same two doors Adicionar has", async () => {
    const onExport = vi.fn();
    const onImport = vi.fn();
    render(<DataPane onExport={onExport} onImport={onImport} onReset={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Exportar…" }));
    await userEvent.click(screen.getByRole("button", { name: "Importar…" }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("asks once before restoring, and Cancelar leaves everything as it was", async () => {
    const onReset = vi.fn();
    render(<DataPane onExport={vi.fn()} onImport={vi.fn()} onReset={onReset} />);

    await userEvent.click(screen.getByRole("button", { name: "Restaurar…" }));
    const confirm = within(screen.getByRole("alertdialog", { name: "Confirmar restauração" }));
    expect(confirm.getByText("Voltar tudo ao padrão?")).toBeInTheDocument();
    expect(confirm.getByText(/Favoritos ficam como estão/)).toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();

    await userEvent.click(confirm.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("restores on confirmation, and goes back to the question", async () => {
    const onReset = vi.fn();
    render(<DataPane onExport={vi.fn()} onImport={vi.fn()} onReset={onReset} />);

    await userEvent.click(screen.getByRole("button", { name: "Restaurar…" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Restaurar" }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Restaurar…" })).toBeInTheDocument();
  });
});

describe("resetSettings", () => {
  const favorites = [
    { name: "Vish", url: "https://x.test/a", key: "v" },
    { name: "Bruxaria", url: "https://x.test/b" }
  ];

  function seed() {
    localStorage.setItem("instants", JSON.stringify(favorites));
    for (const key of settingsKeys) localStorage.setItem(key, JSON.stringify("x"));
    localStorage.setItem("quickAccessHintSeen", JSON.stringify(true));
  }

  it("removes every setting and never the favourites or their keys", () => {
    seed();

    resetSettings();

    for (const key of settingsKeys) expect(localStorage.getItem(key)).toBeNull();
    expect(JSON.parse(localStorage.getItem("instants")!)).toEqual(favorites);
    expect(localStorage.getItem("quickAccessHintSeen")).toBe("true");
  });

  it("never names the favourites among the keys it resets", () => {
    expect(settingsKeys).not.toContain("instants");
    expect([...settingsKeys].sort()).toEqual(
      ["colorMode", "globalShortcuts", "language", "manualServers", "presence", "provider", "quickAccessShortcut", "region", "selectedServer", "theme"].sort()
    );
  });

  it("puts what is on screen back to its default, at once", async () => {
    localStorage.setItem("language", JSON.stringify("en-US"));
    localStorage.setItem("presence", JSON.stringify({ ...defaultPresenceSettings, tray: true }));
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };
    render(
      <>
        <GeneralSection />
        <PresenceSection onOpenKeys={vi.fn()} />
      </>
    );

    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Mostrar na barra de menus" })).toBeChecked();

    act(() => resetSettings());

    await waitFor(() => expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked());
    expect(screen.getByRole("switch", { name: "Mostrar na barra de menus" })).not.toBeChecked();
  });
});
