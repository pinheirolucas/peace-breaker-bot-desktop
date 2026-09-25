import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import i18n from "./i18n";
import { getBotStatus, getContent, playOnDiscord, stopPlayingOnDiscord } from "./service";
import type { BotStatus, ProviderInfo } from "./service";

let mockApiUrl: string | null = "http://10.0.0.5:9001/api/v1";

const providers: ProviderInfo[] = [
  { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
  { key: "soundboardguy", name: "SoundboardGuy", supportsSearch: true, supportsRegion: false }
];

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getApiUrl: vi.fn(() => mockApiUrl),
  setApiUrl: vi.fn((value: unknown) => {
    mockApiUrl = value as string;
    return true;
  }),
  resetApiUrl: vi.fn(() => {
    mockApiUrl = null;
  }),
  isHealthy: vi.fn(() => true),
  onHealthChange: vi.fn(() => () => {}),
  onConnectionError: vi.fn(() => () => {}),
  getContent: vi.fn(),
  playOnDiscord: vi.fn(),
  stopPlayingOnDiscord: vi.fn(),
  getBotStatus: vi.fn(),
  getInstants: vi.fn(() => Promise.resolve({ instants: [], pages: 0 })),
  getProviders: vi.fn(() => Promise.resolve(providers))
}));

class FakeAudio extends EventTarget {
  src = "";
  currentTime = 0;
  play() {
    return Promise.resolve();
  }
  pause() {}
}

const macbook = { id: "mac", apiUrl: "http://10.0.0.5:9001/api/v1", address: "10.0.0.5", port: 9001, hostname: "macbook", isLocal: true };
const raspberry = { id: "rasp", apiUrl: "http://10.0.0.42:9001/api/v1", address: "10.0.0.42", port: 9001, hostname: "raspberry", isLocal: false };

const favorites = [
  { name: "Vish", url: "https://www.myinstants.com/a/", key: "v" },
  { name: "Bruxaria", url: "https://www.myinstants.com/b/", key: "b" },
  { name: "Sem tecla", url: "https://www.myinstants.com/c/" }
];

let settings: NonNullable<Window["instantsSettings"]>;

function bridges() {
  settings = { open: vi.fn(), openAppearance: vi.fn(), appearanceDone: vi.fn(), onSection: () => () => undefined, onConflict: () => () => undefined };
  window.instantsSettings = settings;
  window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };
  window.instantsDiscovery = { onServers: (listener) => { listener([macbook, raspberry]); return () => undefined; }, refresh: vi.fn() };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  localStorage.clear();
  delete document.documentElement.dataset.mode;
  delete document.documentElement.dataset.theme;
  mockApiUrl = macbook.apiUrl;
  vi.stubGlobal("Audio", FakeAudio);
  vi.mocked(getContent).mockReset().mockResolvedValue({ exists: true, content: "data:audio/mp3;x" });
  vi.mocked(playOnDiscord).mockReset().mockResolvedValue("end");
  vi.mocked(stopPlayingOnDiscord).mockReset().mockResolvedValue({} as Response);
  vi.mocked(getBotStatus).mockReset().mockResolvedValue({ connected: true, guildName: "Casa", channelName: "geral" } as BotStatus);
  localStorage.setItem("instants", JSON.stringify(favorites));
  bridges();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const name of ["instantsSettings", "instantsPlatform", "instantsDiscovery", "instantsShortcuts", "instantsQuickAccess"] as const) delete window[name];
});

const palette = () => screen.queryByRole("dialog", { name: "Paleta de comandos" });
const field = () => screen.getByRole("combobox", { name: "Buscar sons e ações" });
const open = () => fireEvent.keyDown(window, { key: "k", ctrlKey: true });

describe("opening", () => {
  it("opens on Ctrl+K from any tab, and Ctrl+K again closes it", async () => {
    const user = userEvent.setup();
    render(<App />);

    open();
    expect(await screen.findByRole("dialog", { name: "Paleta de comandos" })).toBeInTheDocument();
    expect(field()).toHaveFocus();

    open();
    await waitFor(() => expect(palette()).toBeNull());

    await user.click(screen.getByRole("tab", { name: /Explorar/ }));
    open();
    expect(await screen.findByRole("dialog", { name: "Paleta de comandos" })).toBeInTheDocument();
  });

  it("opens from inside the search field", async () => {
    render(<App />);
    const search = screen.getByRole("searchbox", { name: "Procurar um som" });
    search.focus();

    fireEvent.keyDown(search, { key: "k", ctrlKey: true });

    expect(await screen.findByRole("dialog", { name: "Paleta de comandos" })).toBeInTheDocument();
  });

  it("uses Cmd on macOS, and Ctrl+K does nothing there", async () => {
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };
    render(<App />);

    open();
    expect(palette()).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Paleta de comandos" })).toBeInTheDocument();
  });

  it("ignores K with Shift or Alt", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true, altKey: true });

    expect(palette()).toBeNull();
  });

  it("stays shut behind a dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await screen.findByRole("dialog", { name: "Adicionar instant" });
    open();

    expect(palette()).toBeNull();
  });

  it("stays shut while the Aparência shell is open", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.click(screen.getByRole("menuitem", { name: "Aparência" }));
    await screen.findByRole("dialog", { name: "Aparência" });
    open();

    expect(palette()).toBeNull();
  });
});

describe("sounds", () => {
  async function opened() {
    render(<App />);
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });
  }

  it("lists the favourites as Recentes, with their keys", async () => {
    await opened();

    const recents = within(screen.getByRole("group", { name: "Recentes" }));
    expect(recents.getAllByRole("option").map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Vish"), expect.stringContaining("Bruxaria")]));
  });

  it("plays on Discord on Enter, through the card's own path, and closes first", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), "vish");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Vish");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(playOnDiscord).toHaveBeenCalledWith(favorites[0].url));
    expect(palette()).toBeNull();
  });

  it("plays only here on Shift+Enter", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), "bruxaria");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => expect(getContent).toHaveBeenCalledWith(favorites[1].url));
    expect(playOnDiscord).not.toHaveBeenCalled();
  });

  it("finds a sound by its key, and one with none by name", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), "b");
    expect(within(screen.getByRole("group", { name: "Sons" })).getAllByRole("option")[0]).toHaveTextContent("Bruxaria");

    await user.clear(field());
    await user.type(field(), "sem tec");
    expect(within(screen.getByRole("group", { name: "Sons" })).getByRole("option")).toHaveTextContent("Sem tecla");
  });

  it("refuses Enter for a bot known to be out of its channel, and Shift+Enter still plays here", async () => {
    vi.mocked(getBotStatus).mockResolvedValue({ connected: false } as BotStatus);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(getBotStatus).toHaveBeenCalled());
    await act(async () => {});
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });

    const row = screen.getAllByRole("option")[0];
    expect(within(row).getByText("só aqui")).toBeInTheDocument();
    expect(screen.getByText("bot fora de um canal de voz")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(playOnDiscord).not.toHaveBeenCalled();
    expect(palette()).not.toBeNull();
    expect(screen.getByText("O bot não está em um canal. ⇧ Enter toca só aqui.")).toBeInTheDocument();

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await waitFor(() => expect(getContent).toHaveBeenCalled());
  });

  it("does not treat an unknown bot status as away", async () => {
    vi.mocked(getBotStatus).mockRejectedValue(new Error("no route"));
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });

    await user.keyboard("{Enter}");

    await waitFor(() => expect(playOnDiscord).toHaveBeenCalled());
  });

  it("leaves the sounds out in Organizar, and offers the way out first", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Mais ações de adição" }));
    await user.click(screen.getByRole("menuitem", { name: "Organizar" }));
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });

    expect(screen.queryByRole("group", { name: "Recentes" })).toBeNull();
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Concluir Organizar");
    await user.type(field(), "vish");
    expect(screen.queryByRole("group", { name: "Sons" })).toBeNull();
  });

  it("puts Parar o som first while one plays, and stops it on Enter", async () => {
    vi.mocked(playOnDiscord).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("v");
    await waitFor(() => expect(playOnDiscord).toHaveBeenCalled());

    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });

    expect(screen.getByRole("group", { name: "Tocando agora" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { selected: true })[0]).toHaveTextContent("Parar o som");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(stopPlayingOnDiscord).toHaveBeenCalled());
  });

  it("remembers what played, newest first", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("b");
    await waitFor(() => expect(playOnDiscord).toHaveBeenCalled());
    await waitFor(() => expect(JSON.parse(localStorage.getItem("recentClips") ?? "[]")[0]).toBe(favorites[1].url));

    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });

    expect(within(screen.getByRole("group", { name: "Recentes" })).getAllByRole("option")[0]).toHaveTextContent("Bruxaria");
  });

  it("carries a search to Explorar, and never searches the catalogue per keystroke", async () => {
    const user = userEvent.setup();
    render(<App />);
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });

    await user.type(field(), "zzz");
    expect(screen.getByRole("group", { name: "Explorar" })).toHaveTextContent("Buscar “zzz” em MyInstants");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("tab", { name: /Explorar/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("searchbox", { name: "Procurar um som" })).toHaveValue("zzz");
  });
});

describe("actions and settings", () => {
  async function opened() {
    render(<App />);
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });
  }

  it("closes before it opens Configurações, on the section it names", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">servidor");
    await user.click(screen.getByRole("option", { name: /Configurações › Servidor/ }));

    expect(palette()).toBeNull();
    expect(settings.open).toHaveBeenCalledWith("server");
  });

  it("has one row per section in the sidebar's order, and Abrir Configurações on Ctrl+,", async () => {
    const user = userEvent.setup();
    await opened();

    expect(screen.getAllByRole("option").some((o) => /Abrir Configurações/.test(o.textContent ?? "") && /Ctrl,/.test(o.textContent ?? ""))).toBe(true);

    await user.type(field(), ">configurações ›");
    expect(within(screen.getByRole("group", { name: "Configurações" })).getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Geral"),
      expect.stringContaining("Aparência"),
      expect.stringContaining("Servidor"),
      expect.stringContaining("Explorar"),
      expect.stringContaining("Atalhos"),
      expect.stringContaining("Bandeja")
    ]);
  });

  it("runs the Aparência section row as the sidebar's launcher does: it shows the stage", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">configurações › aparência");
    await user.click(screen.getByRole("option", { name: /Configurações › Aparência/ }));

    expect(await screen.findByRole("dialog", { name: "Aparência" })).toBeInTheDocument();
    expect(settings.open).not.toHaveBeenCalled();
  });

  it("opens the add form after closing", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), "adicionar");
    await user.click(screen.getByRole("option", { name: /Adicionar um som/ }));

    expect(await screen.findByRole("dialog", { name: "Adicionar instant" })).toBeInTheDocument();
    expect(palette()).toBeNull();
  });

  it("switches server on Enter and says so", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), "servidor: 10.0.0.42");
    await user.click(screen.getByRole("option", { name: /Servidor: 10\.0\.0\.42:9001/ }));

    expect(JSON.parse(localStorage.getItem("selectedServer")!)).toBe(raspberry.apiUrl);
    expect(await screen.findByText("Conectado a 10.0.0.42:9001")).toBeInTheDocument();
  });

  it("changes the language at once, and Automático removes the key", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">idioma: english");
    await user.click(screen.getByRole("option", { name: /Idioma: English/ }));
    expect(JSON.parse(localStorage.getItem("language")!)).toBe("en-US");

    open();
    await screen.findByRole("dialog", { name: "Command palette" });
    await user.type(screen.getByRole("combobox"), ">language: auto");
    await user.click(screen.getByRole("option", { name: /Language: Automatic/ }));
    expect(localStorage.getItem("language")).toBeNull();
  });

  it("picks the Explorar site at once", async () => {
    const user = userEvent.setup();
    await opened();
    await waitFor(() => expect(screen.queryByRole("option", { name: /Site do Explorar/ })).toBeNull());

    await user.type(field(), ">site do explorar: soundboard");
    await user.click(await screen.findByRole("option", { name: /Site do Explorar: SoundboardGuy/ }));

    expect(JSON.parse(localStorage.getItem("provider")!)).toBe("soundboardguy");
  });

  it("switches the global keys, when the bridge exists, with no preview", async () => {
    window.instantsShortcuts = { modifiers: ["ctrl-alt-shift"], setGlobal: vi.fn().mockResolvedValue({ registered: [], failed: [] }), onFired: () => () => undefined };
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">ligar teclas");
    await user.click(screen.getByRole("option", { name: /Ligar teclas globais/ }));

    expect(JSON.parse(localStorage.getItem("globalShortcuts")!).enabled).toBe(true);
  });

  it("offers no global keys switch without the bridge", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">teclas globais");
    expect(screen.queryByRole("option", { name: /teclas globais/ })).toBeNull();
  });
});

describe("the palette pick and the colour mode", () => {
  async function opened() {
    render(<App />);
    open();
    await screen.findByRole("dialog", { name: "Paleta de comandos" });
  }
  const theme = () => document.documentElement.dataset.theme;
  const mode = () => document.documentElement.dataset.mode;

  async function enterPaleta(user: ReturnType<typeof userEvent.setup>) {
    await user.type(field(), ">paleta");
    await user.keyboard("{Enter}");
    await screen.findByText(/Prévia ao vivo/);
  }

  it("repaints the whole app on each arrow, saves nothing, and never shows the Aparência shell", async () => {
    const user = userEvent.setup();
    await opened();
    await enterPaleta(user);
    const before = theme();

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(theme()).not.toBe(before));

    expect(localStorage.getItem("theme")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Aparência" })).toBeNull();
  });

  it("saves on Enter, closes, and says which palette", async () => {
    const user = userEvent.setup();
    await opened();
    await enterPaleta(user);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    const chosen = theme();
    await user.keyboard("{Enter}");

    expect(JSON.parse(localStorage.getItem("theme")!)).toBe(chosen);
    expect(theme()).toBe(chosen);
    expect(palette()).toBeNull();
    expect(await screen.findByText(/aplicada/)).toBeInTheDocument();
  });

  it("undoes on Esc and leaves nothing behind", async () => {
    const user = userEvent.setup();
    await opened();
    const before = theme();
    await enterPaleta(user);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    await waitFor(() => expect(theme()).not.toBe(before));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(theme()).toBe(before));
    expect(localStorage.getItem("theme")).toBeNull();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(palette()).toBeNull());
    expect(theme()).toBe(before);
  });

  it("undoes when the palette is closed any other way: Ctrl+K", async () => {
    const user = userEvent.setup();
    await opened();
    const before = theme();
    await enterPaleta(user);
    await user.keyboard("{ArrowDown}");

    open();

    await waitFor(() => expect(palette()).toBeNull());
    await waitFor(() => expect(theme()).toBe(before));
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("previews a colour mode on the row, saves it on Enter", async () => {
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">modo: escuro");
    await waitFor(() => expect(mode()).toBe("dark"));
    expect(localStorage.getItem("colorMode")).toBeNull();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(JSON.parse(localStorage.getItem("colorMode")!)).toBe("dark"));
    expect(mode()).toBe("dark");
  });

  it("drops a mode preview when the highlight leaves it", async () => {
    const user = userEvent.setup();
    await opened();
    const before = mode();

    await user.type(field(), ">modo: escuro");
    await waitFor(() => expect(mode()).toBe("dark"));
    await user.clear(field());

    await waitFor(() => expect(mode()).toBe(before));
    expect(localStorage.getItem("colorMode")).toBeNull();
  });

  it("marks the saved palette and mode as atual, not the one being previewed", async () => {
    localStorage.setItem("colorMode", JSON.stringify("light"));
    const user = userEvent.setup();
    await opened();

    await user.type(field(), ">modo");
    expect(within(screen.getByRole("option", { name: /Modo: Claro/ })).getByText("atual")).toBeInTheDocument();
    expect(within(screen.getByRole("option", { name: /Modo: Escuro/ })).queryByText("atual")).toBeNull();
  });
});
