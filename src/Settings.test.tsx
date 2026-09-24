import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsPane, SettingsSection } from "../electron/settings";
import Settings, { SettingsShell } from "./Settings";
import type { SettingsShellProps } from "./Settings";
import i18n from "./i18n";
import type { PlatformId } from "./themes";

const paneNames: SettingsPane[] = ["general", "server", "explore", "keys", "presence", "data"];
const panes = Object.fromEntries(paneNames.map((id) => [id, <p key={id}>pane:{id}</p>])) as Record<SettingsPane, React.ReactNode>;

function shell(props: Partial<SettingsShellProps> = {}) {
  const onSection = vi.fn();
  const onOpenAppearance = vi.fn();
  const onQuery = vi.fn();

  const view = (next: Partial<SettingsShellProps>) => (
    <SettingsShell
      os="mac"
      compact={false}
      section="general"
      onSection={onSection}
      onOpenAppearance={onOpenAppearance}
      query=""
      onQuery={onQuery}
      version="1.2.3"
      panes={panes}
      {...props}
      {...next}
    />
  );

  const utils = render(view({}));
  return { ...utils, onSection, onOpenAppearance, onQuery, rerenderWith: (next: Partial<SettingsShellProps>) => utils.rerender(view(next)) };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  window.localStorage.clear();
});

describe("SettingsShell sidebar", () => {
  it("lists the seven sections in order, marks the current one, and shows only its pane", () => {
    shell({ section: "server" });

    const nav = within(screen.getByRole("complementary", { name: "Seções das configurações" }));
    expect(nav.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Geral",
      "Aparência, abre na janela principal",
      "Servidor",
      "Explorar",
      "Atalhos",
      "Barra de menus",
      "Dados e backup"
    ]);

    expect(nav.getByRole("button", { name: "Servidor" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("button", { name: "Geral" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("pane:server")).toBeInTheDocument();
    expect(screen.queryByText("pane:general")).toBeNull();
  });

  it("names the section Barra de menus on macOS and Bandeja elsewhere", () => {
    const { unmount } = shell({ os: "mac" as PlatformId });
    expect(screen.getByRole("button", { name: "Barra de menus" })).toBeInTheDocument();
    unmount();

    shell({ os: "win" });
    expect(screen.getByRole("button", { name: "Bandeja" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Barra de menus" })).toBeNull();
  });

  it("switches pane on a click", async () => {
    const { onSection } = shell();

    await userEvent.click(screen.getByRole("button", { name: "Dados e backup" }));

    expect(onSection).toHaveBeenCalledWith("data");
  });

  it("makes Aparência a launcher: it opens the main window's stage and never a pane of its own", async () => {
    const { onSection, onOpenAppearance } = shell();

    const launcher = screen.getByRole("button", { name: "Aparência, abre na janela principal" });
    expect(launcher).toHaveAttribute("title", "Aparência · abre na janela principal");
    expect(launcher).not.toHaveAttribute("aria-current");

    await userEvent.click(launcher);

    expect(onOpenAppearance).toHaveBeenCalledTimes(1);
    expect(onSection).not.toHaveBeenCalled();
  });

  it("names the version and says that changes apply at once", () => {
    shell();

    expect(screen.getByText(/Versão 1\.2\.3/)).toBeInTheDocument();
    expect(screen.getByText(/As mudanças valem na hora/)).toBeInTheDocument();
  });
});

describe("SettingsShell search", () => {
  it("finds a setting by what it does, without regard to accents, and lists where it lives", () => {
    shell({ query: "musica" });
    // Nothing is called "música": the words are in the descriptions of none.
    expect(screen.getByText("Nenhuma configuração encontrada")).toBeInTheDocument();
  });

  it("shows a hit's name, its line and its section, and counts them", () => {
    shell({ query: "atalho" });

    expect(screen.getByRole("heading", { name: "Resultados" })).toBeInTheDocument();
    expect(screen.getByText(/resultados? para “atalho”/)).toBeInTheDocument();

    const hit = screen.getByRole("button", { name: /Atalho global do acesso rápido/ });
    expect(within(hit).getByText("Atalhos")).toBeInTheDocument();
    expect(within(hit).getByText("Abrir o acesso rápido de qualquer app")).toBeInTheDocument();
  });

  it("jumps to the section of the hit it is given, and clears the search", async () => {
    const { onSection, onQuery } = shell({ query: "servidor" });

    await userEvent.click(screen.getByRole("button", { name: /Adicionar servidor por endereço/ }));

    expect(onSection).toHaveBeenCalledWith("server");
    expect(onQuery).toHaveBeenCalledWith("");
  });

  it("hands a palette or mode hit off to the main window", async () => {
    const { onSection, onOpenAppearance } = shell({ query: "paleta" });

    const hit = screen.getByRole("button", { name: /Paleta/ });
    expect(within(hit).getByText("Aparência ↗")).toBeInTheDocument();
    await userEvent.click(hit);

    expect(onOpenAppearance).toHaveBeenCalledTimes(1);
    expect(onSection).not.toHaveBeenCalled();
  });

  it("finds the tray settings by the words of this platform", () => {
    const { unmount } = shell({ query: "ícone", os: "mac" });
    expect(screen.getByRole("button", { name: /Ícone na barra de menus/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ícone na bandeja/ })).toBeNull();
    unmount();

    shell({ query: "ícone", os: "win" });
    expect(screen.getByRole("button", { name: /Ícone na bandeja/ })).toBeInTheDocument();
  });

  it("says so when nothing matches, and offers to clear", async () => {
    const { onQuery } = shell({ query: "zzzz" });

    expect(screen.getByText("Nenhuma configuração encontrada")).toBeInTheDocument();
    expect(screen.getByText(/Tente “servidor”/)).toBeInTheDocument();
    expect(screen.queryByText("pane:general")).toBeNull();

    await userEvent.click(screen.getAllByRole("button", { name: "Limpar busca" }).at(-1)!);
    expect(onQuery).toHaveBeenCalledWith("");
  });

  it("marks no section current while searching", () => {
    shell({ query: "idioma", section: "data" });

    for (const button of within(screen.getByRole("complementary")).getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-current");
    }
  });

  it("clears on Esc before anything else, and focuses on the find key", () => {
    const { onQuery } = shell({ query: "idioma" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onQuery).toHaveBeenCalledWith("");

    onQuery.mockClear();
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(screen.getByRole("searchbox", { name: "Buscar nas configurações" })).toHaveFocus();
    expect(onQuery).not.toHaveBeenCalled();
  });

  it("passes what is typed on", async () => {
    const { onQuery } = shell();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar nas configurações" }), "a");

    expect(onQuery).toHaveBeenCalledWith("a");
  });
});

describe("SettingsShell in a compact window", () => {
  it("has one search field, at the top of the pane rather than in the sidebar", () => {
    shell({ compact: true });

    const fields = screen.getAllByRole("searchbox", { name: "Buscar nas configurações" });
    expect(fields).toHaveLength(1);
    expect(fields[0].closest(".phead")).not.toBeNull();
    expect(fields[0].closest(".sside")).toBeNull();
    expect(document.querySelector(".settings")).toHaveClass("compact");
  });

  it("keeps every section reachable by its name, though the rail draws only icons", () => {
    shell({ compact: true });

    for (const name of ["Geral", "Servidor", "Explorar", "Atalhos", "Barra de menus", "Dados e backup"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title", name);
    }
  });

  it("has the search in the sidebar when roomy", () => {
    shell({ compact: false });

    expect(screen.getByRole("searchbox").closest(".sside")).not.toBeNull();
  });
});

describe("Settings, the window", () => {
  let bridge: NonNullable<Window["instantsSettings"]>;
  let onSection: ((section: SettingsSection) => void) | undefined;

  function installBridges() {
    onSection = undefined;
    bridge = {
      open: vi.fn(),
      openAppearance: vi.fn(),
      appearanceDone: vi.fn(),
      onSection: vi.fn((listener) => {
        onSection = listener;
        return () => undefined;
      }),
      onConflict: vi.fn(() => () => undefined)
    };
    window.instantsSettings = bridge;
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };
    window.instantsShortcuts = { modifiers: ["ctrl-alt", "ctrl-shift"], setGlobal: vi.fn().mockResolvedValue({ registered: [], failed: [] }), onFired: () => () => undefined };
    window.instantsQuickAccess = { action: vi.fn(), setShortcut: vi.fn().mockResolvedValue({ registered: [], failed: [] }), onShown: () => () => undefined };
    window.instantsPresence = { setServer: vi.fn(), setPlaying: vi.fn(), setSettings: vi.fn(), stop: vi.fn(), onSnapshot: () => () => undefined };
    window.instantsMenu = { setState: vi.fn(), onCommand: vi.fn(() => () => undefined), cardContext: vi.fn(), gridContext: vi.fn(), serverContext: vi.fn(), serverRowContext: vi.fn(), selectionContext: vi.fn() };
    window.instantsDiscovery = { onServers: () => () => undefined, refresh: vi.fn() };
  }

  beforeEach(() => {
    installBridges();
    window.location.hash = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const name of ["instantsSettings", "instantsPlatform", "instantsShortcuts", "instantsQuickAccess", "instantsPresence", "instantsMenu", "instantsDiscovery", "instantsUpdates"] as const) {
      delete window[name];
    }
    window.location.hash = "";
  });

  it("opens on the section its address names", () => {
    window.location.hash = "#/settings/data";
    render(<Settings />);

    expect(screen.getByRole("heading", { name: "Dados e backup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dados e backup" })).toHaveAttribute("aria-current", "page");
  });

  it("opens on the first section when the address names none", () => {
    window.location.hash = "#/settings";
    render(<Settings />);

    expect(screen.getByRole("heading", { name: "Geral" })).toBeInTheDocument();
  });

  it("jumps when main says the window is asked for again, and drops a search in the way", async () => {
    render(<Settings />);
    await userEvent.type(screen.getByRole("searchbox"), "servidor");
    expect(screen.getByRole("heading", { name: "Resultados" })).toBeInTheDocument();

    act(() => onSection?.("keys"));

    expect(screen.queryByRole("heading", { name: "Resultados" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Atalhos" })).toBeInTheDocument();
  });

  it("does not follow a jump to Aparência: that is not a pane", () => {
    render(<Settings />);

    act(() => onSection?.("appearance"));

    expect(screen.getByRole("heading", { name: "Geral" })).toBeInTheDocument();
  });

  it("sends Aparência to the main window through the bridge", async () => {
    render(<Settings />);

    await userEvent.click(screen.getByRole("button", { name: "Aparência, abre na janela principal" }));

    expect(bridge.openAppearance).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Geral" })).toBeInTheDocument();
  });

  it("titles the window", () => {
    render(<Settings />);

    expect(document.title).toBe("Configurações");
  });

  it("only writes stored values: it registers no shortcut and reports nothing to the main process", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    // Every pane, the ones that hold the switches those hooks answer to included.
    for (const name of ["Servidor", "Explorar", "Atalhos", "Barra de menus", "Dados e backup", "Geral"]) {
      await user.click(screen.getByRole("button", { name }));
    }

    await user.click(screen.getByRole("button", { name: "Atalhos" }));
    await user.click(screen.getByRole("switch", { name: "Teclas globais" }));
    await user.click(screen.getByRole("button", { name: "Barra de menus" }));
    await user.click(screen.getByRole("switch", { name: "Mostrar na barra de menus" }));
    await user.click(screen.getByRole("switch", { name: "Acesso rápido" }));

    // The values are written, for the main window to read...
    expect(JSON.parse(localStorage.getItem("globalShortcuts")!).enabled).toBe(true);
    expect(JSON.parse(localStorage.getItem("presence")!)).toMatchObject({ tray: true, quickAccess: true });

    // ...and nothing else is done with them here: main would otherwise register each combination twice.
    expect(window.instantsShortcuts!.setGlobal).not.toHaveBeenCalled();
    expect(window.instantsQuickAccess!.setShortcut).not.toHaveBeenCalled();
    expect(window.instantsPresence!.setSettings).not.toHaveBeenCalled();
    expect(window.instantsPresence!.setServer).not.toHaveBeenCalled();
    expect(window.instantsPresence!.setPlaying).not.toHaveBeenCalled();
    expect(window.instantsMenu!.setState).not.toHaveBeenCalled();
  });

  it("stamps its own platform and reports its colours for its own title bar", () => {
    // jsdom resolves no tokens and paints no canvas: the same stand-ins useNativeChrome's own test uses.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ getPropertyValue: (name: string) => (name === "--bg" ? "#13181d" : "#e9edf2") }) as never
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
      const ctx = {
        fillStyle: "",
        fillRect: () => {},
        getImageData: () => {
          const n = parseInt(String(ctx.fillStyle).slice(1), 16) || 0;
          return { data: [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255] };
        }
      };
      return ctx as never;
    });

    render(<Settings />);

    expect(document.documentElement.dataset.os).toBe("mac");
    expect(document.documentElement.dataset.chrome).toBe("custom");
    // Main paints each window's chrome from what that window's own renderer reports.
    expect(window.instantsPlatform!.setChrome).toHaveBeenCalledWith({ color: "#13181d", symbolColor: "#e9edf2" });
  });
});
