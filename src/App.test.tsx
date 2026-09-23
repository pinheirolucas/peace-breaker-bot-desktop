import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { getInstants, getProviders, resetApiUrl, setApiUrl } from "./service";
import type { ProviderInfo } from "./service";

// The listeners App registers with the mocked service. Reset to no-ops
// rather than null, so a test can call them without a null check each time.
const noop = () => {};
let healthListener: (healthy: boolean) => void = noop;
let connectionErrorListener: () => void = noop;

// getApiUrl tracks what setApiUrl/resetApiUrl were last called with, so the
// resolution effect's own behaviour (adopt vs. reset to nothing) is what
// drives what the UI shows, not a value hardcoded independently of it.
let mockApiUrl: string | null = null;

// The full registry, matching the real backend's defaultRegistry — most
// tests never look at it, but it means a test that switches to Explorar
// sees exactly what production would offer.
const defaultProviders: ProviderInfo[] = [
  { key: "instantsmeme", name: "InstantsMeme", supportsSearch: true, supportsRegion: false },
  { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
  { key: "soundboardguy", name: "SoundboardGuy", supportsSearch: true, supportsRegion: false },
  { key: "soundbuttons", name: "Sound Buttons", supportsSearch: true, supportsRegion: false }
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
  onHealthChange: vi.fn(listener => {
    healthListener = listener;
    return () => {
      healthListener = noop;
    };
  }),
  onConnectionError: vi.fn(listener => {
    connectionErrorListener = listener;
    return () => {
      connectionErrorListener = noop;
    };
  }),
  getContent: vi.fn(),
  playOnDiscord: vi.fn(),
  stopPlayingOnDiscord: vi.fn(),
  getInstants: vi.fn(() => Promise.resolve({ instants: [], pages: 0 })),
  getProviders: vi.fn(() => Promise.resolve(defaultProviders))
}));

const macbook = {
  id: "MacBook-Pro-de-Lucas.local-9001._myinstants._tcp.local",
  apiUrl: "http://10.0.0.133:9001",
  address: "10.0.0.133",
  port: 9001,
  hostname: "MacBook-Pro-de-Lucas",
  isLocal: true
};

const raspberry = {
  id: "raspberrypi.local-9001._myinstants._tcp.local",
  apiUrl: "http://10.0.0.42:9001",
  address: "10.0.0.42",
  port: 9001,
  hostname: "raspberrypi",
  isLocal: false
};

function installBridge({ unsubscribe = vi.fn() }: { unsubscribe?: (() => void) | undefined } = {}) {
  const bridge = {
    push: (_servers: unknown[]): void => {},
    unsubscribe,
    refresh: vi.fn(),
    onServers: vi.fn(listener => {
      bridge.push = listener;
      return unsubscribe;
    })
  };

  window.instantsDiscovery = bridge;
  return bridge;
}

// The server chip is named by the address it shows, plus "não está
// respondendo" as screen-reader text while the server is silent, or by
// "Nenhum servidor encontrado" while nothing is picked or discovered.
function serverChip(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

// Opens via the chip's title rather than its accessible name, which is the
// current address (or "no server") and so varies test to test.
async function openServerMenu() {
  await userEvent.click(screen.getByTitle("Trocar de servidor"));
}

function toasts() {
  return within(screen.getByRole("region", { name: /Notificações/ }));
}

function searchBox() {
  return screen.getByRole("searchbox", { name: "Procurar um som" });
}

// The Explorar filter is one icon whose name is not its content, in either
// language.
const FILTER = /^(Filtrar por site e região|Filter by site and region)$/;

function filterButton() {
  return screen.getByRole("button", { name: FILTER });
}

function tickedItem(name: string) {
  return screen.getByRole("menuitem", { name }).querySelector(".mtick svg");
}

function reset() {
  localStorage.clear();
  delete document.documentElement.dataset.mode;
  delete document.documentElement.dataset.theme;
  healthListener = noop;
  connectionErrorListener = noop;
  mockApiUrl = null;
  vi.mocked(setApiUrl).mockReset();
  vi.mocked(setApiUrl).mockImplementation((value: unknown) => {
    mockApiUrl = value as string;
    return true;
  });
  vi.mocked(resetApiUrl).mockClear();
  vi.mocked(getInstants).mockClear();
  vi.mocked(getProviders).mockClear();
  vi.mocked(getProviders).mockImplementation(() => Promise.resolve(defaultProviders));
}

afterEach(() => {
  delete window.instantsDiscovery;
});

describe("App discovery wiring", () => {
  beforeEach(reset);

  it("resets to no server at all with no bridge and nothing picked", () => {
    expect(window.instantsDiscovery).toBeUndefined();

    expect(() => render(<App />)).not.toThrow();
    expect(resetApiUrl).toHaveBeenCalled();
    expect(setApiUrl).not.toHaveBeenCalled();
  });

  it("adopts the first discovered server when the user has picked none", () => {
    const bridge = installBridge();
    render(<App />);

    act(() => bridge.push([macbook, raspberry]));

    expect(setApiUrl).toHaveBeenLastCalledWith("http://10.0.0.133:9001");
  });

  it("keeps the auto-adopted server stable as more are discovered", () => {
    const bridge = installBridge();
    render(<App />);

    act(() => bridge.push([macbook]));
    act(() => bridge.push([macbook, raspberry]));

    expect(setApiUrl).toHaveBeenLastCalledWith("http://10.0.0.133:9001");
  });

  it("returns to no server when every discovered server goes away", () => {
    const bridge = installBridge();
    render(<App />);

    act(() => bridge.push([macbook]));
    act(() => bridge.push([]));

    expect(resetApiUrl).toHaveBeenCalled();
  });

  it("ignores a bridge that exposes no onServers", () => {
    // Deliberately malformed: the absence of onServers has to be a no-op.
    window.instantsDiscovery = {} as unknown as Window["instantsDiscovery"];

    expect(() => render(<App />)).not.toThrow();
    expect(resetApiUrl).toHaveBeenCalled();
  });

  it("unsubscribes when the app unmounts", () => {
    const unsubscribe = vi.fn();
    installBridge({ unsubscribe });

    const { unmount } = render(<App />);
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unmounts cleanly when the bridge returns no unsubscribe", () => {
    installBridge({ unsubscribe: undefined });

    const { unmount } = render(<App />);

    expect(() => unmount()).not.toThrow();
  });
});

describe("server picker", () => {
  beforeEach(reset);

  it("lists the discovered servers with the local one marked", async () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook, raspberry]));

    await openServerMenu();

    const menu = screen.getByRole("menu");
    expect(within(menu).getByText(/Conectado a/)).toBeInTheDocument();
    const macbookItem = within(menu).getByRole("menuitem", { name: /10\.0\.0\.133:9001/ });
    expect(macbookItem).toHaveTextContent("MacBook-Pro-de-Lucas · este computador");
    expect(within(menu).getByText("raspberrypi")).toBeInTheDocument();
    expect(within(menu).getByText("Rede local")).toBeInTheDocument();
  });

  it("switches to a picked server in one click, remembers it, and keeps the menu open", async () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook, raspberry]));

    await openServerMenu();
    await userEvent.click(screen.getByText("10.0.0.42:9001"));

    expect(setApiUrl).toHaveBeenLastCalledWith("http://10.0.0.42:9001");
    expect(JSON.parse(localStorage.getItem("selectedServer") ?? "null")).toBe("http://10.0.0.42:9001");
    expect(screen.getByText("Procurar novamente")).toBeInTheDocument();
  });

  it("keeps an explicit pick over the auto-adopted first server", () => {
    localStorage.setItem("selectedServer", JSON.stringify("http://10.0.0.42:9001"));

    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook, raspberry]));

    expect(setApiUrl).toHaveBeenLastCalledWith("http://10.0.0.42:9001");
  });

  it("falls back to discovery when the remembered pick is rejected", () => {
    localStorage.setItem("selectedServer", JSON.stringify("not-a-url"));
    vi.mocked(setApiUrl).mockImplementation(value => value !== "not-a-url");

    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    expect(setApiUrl).toHaveBeenLastCalledWith("http://10.0.0.133:9001");
  });

  it("says so when nothing was discovered", async () => {
    installBridge();
    render(<App />);

    await openServerMenu();

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /Nenhum servidor encontrado/ })
    ).toBeInTheDocument();
  });

  it("asks the main process to browse again, keeping the menu open", async () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    await openServerMenu();
    await userEvent.click(screen.getByText("Procurar novamente"));

    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Procurar novamente")).toBeInTheDocument();
  });
});

describe("manual servers", () => {
  beforeEach(reset);

  const manual = {
    id: "http://bot.example.com:9001",
    apiUrl: "http://bot.example.com:9001",
    address: null,
    port: 9001,
    hostname: null,
    isLocal: false,
    manual: true
  };

  it("opens the add-server dialog from the picker, and Cancelar closes it with nothing added", async () => {
    installBridge();
    render(<App />);

    await openServerMenu();
    await userEvent.click(screen.getByText("Adicionar servidor"));

    expect(screen.getByRole("dialog", { name: "Adicionar servidor" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("manualServers") ?? "[]")).toEqual([]);
  });

  it("lists a persisted manual server under Remoto, adopted the same way a discovered one is", () => {
    localStorage.setItem("manualServers", JSON.stringify([manual]));

    installBridge();
    render(<App />);

    expect(setApiUrl).toHaveBeenLastCalledWith(manual.apiUrl);
  });

  it("removing the active manual server drops the selection back to no server at all", async () => {
    localStorage.setItem("manualServers", JSON.stringify([manual]));
    localStorage.setItem("selectedServer", JSON.stringify(manual.apiUrl));

    installBridge();
    render(<App />);
    expect(setApiUrl).toHaveBeenLastCalledWith(manual.apiUrl);

    await openServerMenu();
    await userEvent.click(screen.getByRole("button", { name: "Remover bot.example.com:9001" }));

    expect(resetApiUrl).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("manualServers") ?? "[]")).toEqual([]);
  });

  it("removing a manual server that isn't the active one leaves the active pick alone", async () => {
    const other = { ...manual, id: "http://other.example.com:9001", apiUrl: "http://other.example.com:9001" };
    localStorage.setItem("manualServers", JSON.stringify([manual, other]));
    localStorage.setItem("selectedServer", JSON.stringify(manual.apiUrl));

    installBridge();
    render(<App />);

    await openServerMenu();
    await userEvent.click(screen.getByRole("button", { name: "Remover other.example.com:9001" }));

    expect(setApiUrl).toHaveBeenLastCalledWith(manual.apiUrl);
    expect(JSON.parse(localStorage.getItem("manualServers") ?? "[]")).toEqual([manual]);
  });
});

describe("connection health", () => {
  beforeEach(reset);

  it("names no server on the chip until one is picked or discovered", () => {
    installBridge();
    render(<App />);

    expect(serverChip("Nenhum servidor encontrado")).toBeInTheDocument();
  });

  it("names the server on the chip while it answers", () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    expect(serverChip("10.0.0.133:9001")).toBeInTheDocument();
  });

  it("says so on the chip, and toasts, when the server stops answering", () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    act(() => {
      healthListener(false);
      connectionErrorListener();
    });

    expect(serverChip("10.0.0.133:9001 não está respondendo")).toBeInTheDocument();
    expect(toasts().getByText("Não foi possível conectar a 10.0.0.133:9001")).toBeInTheDocument();
    expect(toasts().getByRole("button", { name: "Trocar" })).toBeInTheDocument();
  });

  it("names the missing server in the toast when there is nothing to connect to", () => {
    installBridge();
    render(<App />);

    act(() => {
      healthListener(false);
      connectionErrorListener();
    });

    expect(toasts().getByText("Nenhum servidor encontrado")).toBeInTheDocument();
  });

  it("opens the picker from the toast action", async () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    act(() => {
      healthListener(false);
      connectionErrorListener();
    });
    await userEvent.click(toasts().getByRole("button", { name: "Trocar" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("clears the flag when the server answers again", () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    act(() => healthListener(false));
    act(() => healthListener(true));

    expect(serverChip("10.0.0.133:9001")).toBeInTheDocument();
  });
});

describe("snackbar precedence while offline", () => {
  beforeEach(reset);

  it("keeps the connection toast when a panel reports its own error after it", async () => {
    vi.mocked(getInstants).mockRejectedValueOnce(
      new Error("Erro desconhecido, tente novamente mais tarde")
    );

    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    act(() => {
      healthListener(false);
      connectionErrorListener();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(toasts().getByText("Não foi possível conectar a 10.0.0.133:9001")).toBeInTheDocument();
    expect(screen.queryByText("Erro desconhecido, tente novamente mais tarde")).not.toBeInTheDocument();

    vi.mocked(getInstants).mockResolvedValue({ instants: [], pages: 0 });
  });
});

describe("repeated failures while already offline", () => {
  beforeEach(reset);

  it("re-shows the toast on a later failure, so a click is never silent", async () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    act(() => {
      healthListener(false);
      connectionErrorListener();
    });

    await userEvent.click(toasts().getByRole("button", { name: "Fechar" }));

    await waitFor(() =>
      expect(screen.queryByText("Não foi possível conectar a 10.0.0.133:9001")).not.toBeInTheDocument()
    );

    act(() => connectionErrorListener());

    expect(toasts().getByText("Não foi possível conectar a 10.0.0.133:9001")).toBeInTheDocument();
  });
});

describe("shell", () => {
  beforeEach(reset);

  function seedFavorite() {
    localStorage.setItem(
      "instants",
      JSON.stringify([{ name: "Vish", url: "https://www.myinstants.com/v/" }])
    );
  }

  it("opens on Favoritos, with the section tabs and the search", () => {
    seedFavorite();
    render(<App />);

    expect(screen.getByRole("tab", { name: "Favoritos" })).toHaveAttribute("aria-selected", "true");
    expect(searchBox()).toBeInTheDocument();
    // The page is no longer a heading: the title bar is the toolbar.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("names the page and its count in the window title", async () => {
    localStorage.setItem(
      "instants",
      JSON.stringify([
        { name: "Vish", url: "https://www.myinstants.com/v/" },
        { name: "Bruxaria", url: "https://www.myinstants.com/b/" }
      ])
    );
    render(<App />);

    await waitFor(() => expect(document.title).toBe("Favoritos — 2 sons salvos"));

    await userEvent.click(screen.getByRole("tab", { name: "Explorar" }));

    await waitFor(() => expect(document.title).toMatch(/^Explorar/));
  });

  it("keeps Favoritos mounted but hidden on Explorar, so its keys keep working", async () => {
    localStorage.setItem(
      "instants",
      JSON.stringify([{ name: "Vish", url: "https://www.myinstants.com/v/", key: "v" }])
    );
    render(<App />);

    await userEvent.click(screen.getByRole("tab", { name: "Explorar" }));

    expect(screen.getAllByRole("tabpanel", { hidden: true })[0]).not.toBeVisible();
    await waitFor(() => expect(document.title).toMatch(/^Explorar/));
  });

  it("opens the keyboard sheet with ? and closes it with ? again", async () => {
    localStorage.setItem(
      "instants",
      JSON.stringify([{ name: "Vish", url: "https://www.myinstants.com/v/", key: "v" }])
    );
    render(<App />);

    await userEvent.keyboard("?");
    expect(await screen.findByRole("dialog", { name: "Atalhos do teclado" })).toBeInTheDocument();

    await userEvent.keyboard("?");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says how many favourites the search covers, and which site on Explorar", async () => {
    localStorage.setItem(
      "instants",
      JSON.stringify([{ name: "Vish", url: "https://www.myinstants.com/v/" }])
    );
    render(<App />);

    expect(searchBox()).toHaveAttribute("placeholder", "Buscar em 1 favorito");

    await userEvent.click(screen.getByRole("tab", { name: "Explorar" }));

    expect(searchBox()).toHaveAttribute("placeholder", "Buscar em MyInstants");
  });

  it("switches to Explorar from the segmented control", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("tab", { name: "Explorar" }));

    expect(screen.getByRole("tab", { name: "Explorar" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("switches tab from the keyboard, and opens the add form with Ctrl or Cmd+N", async () => {
    render(<App />);

    // Both modifiers, so the test holds whichever platform it runs on.
    fireEvent.keyDown(window, { key: "2", ctrlKey: true, metaKey: true });
    expect(screen.getByRole("tab", { name: "Explorar" })).toHaveAttribute("aria-selected", "true");

    // Adicionar belongs to Favoritos.
    fireEvent.keyDown(window, { key: "n", ctrlKey: true, metaKey: true });
    expect(screen.queryByRole("dialog", { name: "Adicionar instant" })).toBeNull();

    fireEvent.keyDown(window, { key: "1", ctrlKey: true, metaKey: true });
    expect(screen.getByRole("tab", { name: "Favoritos" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(window, { key: "n", ctrlKey: true, metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Adicionar instant" })).toBeInTheDocument();
  });

  it("opens the add form from the toolbar", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(screen.getByRole("dialog", { name: "Adicionar instant" })).toBeInTheDocument();
  });

  it("carries a search with no favourite match over to MyInstants", async () => {
    localStorage.setItem(
      "instants",
      JSON.stringify([{ name: "Vish", url: "https://www.myinstants.com/v/" }])
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(searchBox(), "xuxa");
    await user.click(await screen.findByRole("button", { name: "Procurar “xuxa” no MyInstants" }));

    expect(screen.getByRole("tab", { name: "Explorar" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(getInstants).toHaveBeenLastCalledWith(1, "xuxa", "br"));
    // The query survives the switch, rather than making them retype it.
    expect(searchBox()).toHaveValue("xuxa");
  });

  it("leaves the search out on Favoritos while there is nothing to search, and keeps it on Explorar", async () => {
    render(<App />);

    expect(screen.queryByRole("searchbox")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Explorar" }));
    expect(searchBox()).toBeInTheDocument();
  });

  it("does not carry a search over to a Favoritos that has no field to show it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Explorar" }));
    await user.type(searchBox(), "xuxa");

    await user.click(screen.getByRole("tab", { name: "Favoritos" }));
    await user.click(screen.getByRole("tab", { name: "Explorar" }));

    expect(searchBox()).toHaveValue("");
  });

  it("does nothing on the find shortcut with no search field to focus", () => {
    render(<App />);
    const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, metaKey: true, cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("focuses the search on the find shortcut", () => {
    seedFavorite();
    render(<App />);

    // The modifier is per-platform (Cmd on macOS, Ctrl elsewhere). Press both
    // so the test holds on whichever platform it runs on.
    fireEvent.keyDown(window, { key: "f", ctrlKey: true, metaKey: true });

    expect(searchBox()).toHaveFocus();
  });

  async function openAppearance(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.click(screen.getByRole("menuitem", { name: "Aparência" }));
    return screen.findByRole("dialog", { name: "Aparência" });
  }

  it("follows the OS by default and remembers an explicit mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    // setupTests' matchMedia stub reports a light OS.
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe("light"));

    await openAppearance(user);
    await user.click(screen.getByRole("radio", { name: "Escuro" }));

    // Previewed at once, but not kept until Pronto.
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe("dark"));
    expect(localStorage.getItem("colorMode")).not.toBe(JSON.stringify("dark"));

    await user.click(screen.getByRole("button", { name: "Pronto" }));

    expect(JSON.parse(localStorage.getItem("colorMode") ?? "null")).toBe("dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(screen.queryByRole("dialog", { name: "Aparência" })).not.toBeInTheDocument();
  });

  it("opens Aparência on what is in use, with focus on the palette", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAppearance(user);

    expect(screen.getByRole("radio", { name: "Automático" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Esmalte" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Esmalte" })).toHaveFocus();
  });

  it("previews a palette on the whole window and keeps it only on Pronto", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAppearance(user);
    await user.click(screen.getByRole("radio", { name: "Frevo" }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("frevo"));
    expect(localStorage.getItem("theme")).not.toBe(JSON.stringify("frevo"));

    await user.click(screen.getByRole("button", { name: "Pronto" }));

    expect(JSON.parse(localStorage.getItem("theme") ?? "null")).toBe("frevo");
    expect(document.documentElement.dataset.theme).toBe("frevo");
  });

  it("puts palette and mode back on Cancelar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAppearance(user);
    await user.click(screen.getByRole("radio", { name: "Fliperama" }));
    await user.click(screen.getByRole("radio", { name: "Escuro" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("fliperama"));
    expect(document.documentElement.dataset.mode).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("esmalte"));
    expect(document.documentElement.dataset.mode).toBe("light");
    expect(localStorage.getItem("theme")).not.toBe(JSON.stringify("fliperama"));
    expect(screen.queryByRole("dialog", { name: "Aparência" })).not.toBeInTheDocument();
  });

  it("treats Escape as Cancelar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAppearance(user);
    await user.click(screen.getByRole("radio", { name: "OLED" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("oled"));

    await user.keyboard("{Escape}");

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("esmalte"));
    expect(screen.queryByRole("dialog", { name: "Aparência" })).not.toBeInTheDocument();
  });

  it("runs on the default palette until another is picked", async () => {
    render(<App />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("esmalte"));
  });
});

describe("catalogue region", () => {
  beforeEach(reset);

  // Matches either language: one test in this block switches to English,
  // and the tab label is now a real translation rather than the literal
  // "MyInstants" it used to be regardless of locale.
  async function openExplore() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /^(Explorar|Explore)$/ }));
    return user;
  }

  it("browses Brazil by default, and offers the filter only on Explorar", async () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: FILTER })).toBeNull();

    const user = await openExplore();

    await user.click(filterButton());
    expect(tickedItem("Brasil")).not.toBeNull();
    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("refetches the catalogue for a picked region and remembers it, keeping the menu open", async () => {
    render(<App />);
    const user = await openExplore();

    await user.click(filterButton());
    await user.click(screen.getByRole("menuitem", { name: "Portugal" }));

    await waitFor(() => expect(getInstants).toHaveBeenLastCalledWith(1, "", "pt"));
    expect(JSON.parse(localStorage.getItem("region") ?? "null")).toBe("pt");
    // Open still, and moved: setting a site and a region is one visit.
    expect(tickedItem("Portugal")).not.toBeNull();
    expect(tickedItem("Brasil")).toBeNull();
  });

  it("marks the filter when the region is not the default, and restores it from the menu", async () => {
    localStorage.setItem("region", JSON.stringify("pt"));
    render(<App />);
    const user = await openExplore();

    expect(filterButton()).toHaveAttribute("data-changed", "true");

    await user.click(filterButton());
    await user.click(screen.getByRole("menuitem", { name: "Restaurar padrão" }));

    await waitFor(() => expect(getInstants).toHaveBeenLastCalledWith(1, "", "br"));
    // An open menu is modal: what is behind it is hidden from the tree.
    await user.keyboard("{Escape}");
    expect(filterButton()).not.toHaveAttribute("data-changed");
  });

  it("restores the stored region on the next launch", async () => {
    localStorage.setItem("region", JSON.stringify("us"));
    render(<App />);

    const user = await openExplore();
    await user.click(filterButton());

    expect(tickedItem("Estados Unidos")).not.toBeNull();
    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "us"));
  });

  it.each([
    ["an unknown code", JSON.stringify("zz")],
    ["an uppercase code", JSON.stringify("PT")],
    ["not a string", JSON.stringify(42)],
    ["corrupt JSON", "{not json"]
  ])("falls back to Brazil when the stored region is %s", async (_, raw) => {
    localStorage.setItem("region", raw);
    render(<App />);

    const user = await openExplore();
    await user.click(filterButton());

    expect(tickedItem("Brasil")).not.toBeNull();
    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("names regions in English once the language switches", async () => {
    localStorage.setItem("language", JSON.stringify("en-US"));
    localStorage.setItem("region", JSON.stringify("us"));
    render(<App />);

    const user = await openExplore();
    await user.click(filterButton());

    expect(tickedItem("United States")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "United Kingdom" })).toBeInTheDocument();
  });
});

describe("provider picker", () => {
  beforeEach(reset);

  async function openExploreWithServer() {
    const bridge = installBridge();
    const user = userEvent.setup();
    render(<App />);
    act(() => bridge.push([macbook]));
    await user.click(screen.getByRole("tab", { name: /^(Explorar|Explore)$/ }));
    return user;
  }

  it("lists every provider from the registry, ticking the default", async () => {
    const user = await openExploreWithServer();

    await user.click(await screen.findByRole("button", { name: FILTER }));

    expect(tickedItem("MyInstants")).not.toBeNull();
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("Sound Buttons")).toBeInTheDocument();
    expect(menu.getByText("InstantsMeme")).toBeInTheDocument();
    expect(menu.getByText("SoundboardGuy")).toBeInTheDocument();
  });

  it("switches provider in one click, remembers it, and restarts the listing from page 1", async () => {
    const user = await openExploreWithServer();

    await user.click(await screen.findByRole("button", { name: FILTER }));
    await user.click(screen.getByRole("menuitem", { name: "Sound Buttons" }));

    await waitFor(() => expect(getInstants).toHaveBeenLastCalledWith(1, "", "br", "soundbuttons"));
    expect(JSON.parse(localStorage.getItem("provider") ?? "null")).toBe("soundbuttons");
    expect(tickedItem("Sound Buttons")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(searchBox()).toHaveAttribute("placeholder", "Buscar em Sound Buttons");
  });

  it("drops the region from the menu once a provider that doesn't support it is picked", async () => {
    const user = await openExploreWithServer();
    await user.click(await screen.findByRole("button", { name: FILTER }));
    expect(screen.getByRole("menuitem", { name: "Brasil" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Sound Buttons" }));

    expect(screen.queryByRole("menuitem", { name: "Brasil" })).toBeNull();
    // Still open, and now offering a way back to the default site.
    expect(screen.getByRole("menuitem", { name: "Restaurar padrão" })).toBeInTheDocument();
  });

  it("restores the stored provider on the next launch", async () => {
    localStorage.setItem("provider", JSON.stringify("soundbuttons"));
    const user = await openExploreWithServer();

    await user.click(await screen.findByRole("button", { name: FILTER }));

    expect(tickedItem("Sound Buttons")).not.toBeNull();
    await waitFor(() => expect(getInstants).toHaveBeenCalledWith(1, "", "br", "soundbuttons"));
  });

  // Same rule this app already applies to a stale selectedServer or an
  // unrecognized region code: never assume, never error on local state that
  // might be pointed at something gone.
  it("falls back to MyInstants, silently, when the stored provider no longer exists", async () => {
    localStorage.setItem("provider", JSON.stringify("longgoneprovider"));
    const user = await openExploreWithServer();

    await user.click(await screen.findByRole("button", { name: FILTER }));

    expect(tickedItem("MyInstants")).not.toBeNull();
    expect(screen.queryByText(/longgoneprovider/)).not.toBeInTheDocument();
  });

  it("offers only the region, and no sites, when the backend has no /providers route", async () => {
    vi.mocked(getProviders).mockRejectedValue(new Error("404"));
    const user = await openExploreWithServer();

    await waitFor(() => expect(getProviders).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: FILTER }));

    expect(screen.queryByRole("menuitem", { name: "MyInstants" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Brasil" })).toBeInTheDocument();
  });
});

describe("native window chrome", () => {
  beforeEach(() => {
    reset();
    delete document.documentElement.dataset.os;
    delete document.documentElement.dataset.chrome;
    delete document.documentElement.dataset.desktop;
  });

  afterEach(() => {
    delete window.instantsPlatform;
  });

  it("stamps the platform and lets the toolbar be the title bar on macOS", () => {
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };

    const { container } = render(<App />);

    expect(container.querySelector(".toolbar")).not.toBeNull();
    // The hero and the drag row it used to sit under are gone.
    expect(container.querySelector(".hero, .tb, .tools")).toBeNull();
    expect(document.documentElement.dataset.os).toBe("mac");
    expect(document.documentElement.dataset.chrome).toBe("custom");
    expect(document.documentElement.dataset.desktop).toBeUndefined();
  });

  it("names the app in the Windows bar, beside the OS caption buttons", () => {
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };

    const { container } = render(<App />);

    expect(container.querySelector(".toolbar__brand")).toHaveTextContent("Peace Breaker Bot");
  });

  it("stamps GNOME on Linux, where the header bar is the app's own", () => {
    window.instantsPlatform = {
      os: "linux",
      desktop: "gnome",
      chrome: "custom",
      setChrome: vi.fn()
    };

    const { container } = render(<App />);

    expect(document.documentElement.dataset.desktop).toBe("gnome");
    expect(document.documentElement.dataset.chrome).toBe("custom");
    expect(container.querySelector(".toolbar__brand")).toBeNull();
    // The menu button is the GNOME hamburger, not the three dots.
    expect(screen.getByRole("button", { name: "Mais opções" }).querySelector("path")).not.toBeNull();
  });

  it("keeps the window manager's title bar on KDE, under one toolbar", () => {
    window.instantsPlatform = {
      os: "linux",
      desktop: "kde",
      chrome: "native",
      setChrome: vi.fn()
    };

    const { container } = render(<App />);

    expect(document.documentElement.dataset.desktop).toBe("kde");
    expect(document.documentElement.dataset.chrome).toBe("native");
    expect(container.querySelector(".toolbar")).not.toBeNull();
  });

  it("stamps no desktop off Linux", () => {
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };
    document.documentElement.dataset.desktop = "gnome";

    render(<App />);

    expect(document.documentElement.dataset.desktop).toBeUndefined();
  });

  it("draws the toolbar in a plain browser tab too, with no app name", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".toolbar")).not.toBeNull();
    expect(container.querySelector(".toolbar__brand")).toBeNull();
  });
});

describe("Organizar", () => {
  beforeEach(() => {
    reset();
    localStorage.setItem(
      "instants",
      JSON.stringify([
        { name: "Primeiro", url: "https://www.myinstants.com/a/" },
        { name: "Segundo", url: "https://www.myinstants.com/b/" }
      ])
    );
  });

  afterEach(() => localStorage.clear());

  async function openAddMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Mais ações de adição" }));
  }

  it("is not offered with no favourites at all", async () => {
    localStorage.setItem("instants", "[]");
    const user = userEvent.setup();
    render(<App />);

    await openAddMenu(user);

    expect(screen.queryByRole("menuitem", { name: /Organizar/ })).toBeNull();
    // What else changes the list is still there.
    expect(screen.getByRole("menuitem", { name: "Importar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Exportar" })).toBeInTheDocument();
  });

  it("swaps Adicionar for Concluir and takes the search away while it is on", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAddMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Organizar/ }));

    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText("Arraste para reordenar · ⌨ define a tecla", { selector: ".toolbar__hint" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluir" }));

    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeEnabled();
  });

  it("stays out of reach while a search is set, and says why", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("searchbox"), "seg");
    await openAddMenu(user);
    const item = screen.getByRole("menuitem", { name: /Organizar/ });

    expect(item).toHaveAttribute("data-disabled");
    expect(item).toHaveTextContent("Limpe a busca para organizar");

    await user.click(item);

    expect(screen.queryByRole("button", { name: "Concluir" })).toBeNull();
  });

  it("leaves the mode when the tab changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAddMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Organizar/ }));
    await user.click(screen.getByRole("tab", { name: "Explorar" }));
    await user.click(screen.getByRole("tab", { name: "Favoritos" }));

    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).toBeNull();
  });
});

describe("Adicionar menu", () => {
  beforeEach(reset);

  it("carries Importar and Exportar, which the overflow menu no longer does", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    expect(screen.queryByRole("menuitem", { name: "Importar" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Exportar" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Aparência" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Mais ações de adição" }));
    await user.click(screen.getByRole("menuitem", { name: "Importar" }));

    expect(await screen.findByRole("dialog", { name: "Importar instants" })).toBeInTheDocument();
  });
});

describe("Configurações doors", () => {
  let settings: NonNullable<Window["instantsSettings"]>;

  function bridge() {
    settings = { open: vi.fn(), openAppearance: vi.fn(), onSection: () => () => undefined, onConflict: () => () => undefined };
    window.instantsSettings = settings;
  }

  beforeEach(() => {
    reset();
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.instantsSettings;
    delete window.instantsPlatform;
    delete window.instantsShortcuts;
  });

  async function openMore(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    return within(await screen.findByRole("menu"));
  }

  it("ends the overflow menu with Aparência, Configurações… and Atalhos do teclado, and nothing else", async () => {
    bridge();
    const user = userEvent.setup();
    render(<App />);

    const menu = await openMore(user);

    expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Aparência",
      "Configurações…Ctrl+,",
      "Atalhos do teclado?"
    ]);
  });

  it("has no language, menu bar or update items any more: they live in Configurações", async () => {
    bridge();
    const user = userEvent.setup();
    render(<App />);

    const menu = await openMore(user);

    for (const name of [/Barra de menus/, "Português", "English", /Verificar atualizações/, /Check for Updates/]) {
      expect(menu.queryByRole("menuitem", { name })).toBeNull();
    }
  });

  it("shows ⌘, on macOS", async () => {
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };
    bridge();
    const user = userEvent.setup();
    render(<App />);

    expect((await openMore(user)).getByRole("menuitem", { name: /Configurações…/ })).toHaveTextContent("⌘,");
  });

  it("opens Configurações from the overflow menu, on no section in particular", async () => {
    bridge();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await openMore(user)).getByRole("menuitem", { name: /Configurações…/ }));

    expect(settings.open).toHaveBeenCalledTimes(1);
    expect(settings.open).toHaveBeenCalledWith(undefined);
  });

  it("keeps Aparência a direct door to the stage", async () => {
    bridge();
    const user = userEvent.setup();
    render(<App />);

    await user.click((await openMore(user)).getByRole("menuitem", { name: "Aparência" }));

    expect(await screen.findByRole("dialog", { name: "Aparência" })).toBeInTheDocument();
    expect(settings.open).not.toHaveBeenCalled();
  });

  it("opens the same page in a tab where there is no main process to ask", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    render(<App />);

    await user.click((await openMore(user)).getByRole("menuitem", { name: /Configurações…/ }));

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/#\/settings$/), "_blank");
  });

  it("opens the server picker's footer on Servidor", async () => {
    bridge();
    installBridge().push([macbook]);
    const user = userEvent.setup();
    render(<App />);

    await openServerMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Configurações do servidor…" }));

    expect(settings.open).toHaveBeenCalledWith("server");
  });

  it("opens the Explorar filter's footer on Explorar", async () => {
    bridge();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: /Explorar/ }));

    await user.click(await screen.findByRole("button", { name: FILTER }));
    await user.click(await screen.findByRole("menuitem", { name: "Mais em Configurações…" }));

    expect(settings.open).toHaveBeenCalledWith("explore");
  });

  it("opens the shortcut sheet's pointer on Atalhos, where the global keys are", async () => {
    bridge();
    window.instantsShortcuts = { modifiers: ["ctrl-alt-shift"], setGlobal: vi.fn().mockResolvedValue({ registered: [], failed: [] }), onFired: () => () => undefined };
    const user = userEvent.setup();
    render(<App />);

    await user.click((await openMore(user)).getByRole("menuitem", { name: /Atalhos do teclado/ }));
    await user.click(await screen.findByRole("button", { name: "Atalhos globais em Configurações…" }));

    expect(settings.open).toHaveBeenCalledWith("keys");
  });

  it("keeps Adicionar ▾ exactly as it was: Organizar, Importar and Exportar", async () => {
    bridge();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Mais ações de adição" }));

    expect(screen.getByRole("menuitem", { name: "Importar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Exportar" })).toBeInTheDocument();
  });
});

describe("Tight window", () => {
  const original = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    reset();
    // jsdom lays nothing out; the app root is the one thing whose width the
    // tier reads.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element
    ) {
      return this.classList.contains("app")
        ? ({ width: 500, height: 800, top: 0, left: 0, right: 500, bottom: 800, x: 0, y: 0 } as DOMRect)
        : original.call(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.instantsPlatform;
  });

  it("moves the server into the overflow menu, and opens its picker from there", async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    render(<App />);
    act(() => bridge.push([macbook]));

    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.click(await screen.findByRole("menuitem", { name: /10\.0\.0\.133:9001/ }));

    // The picker, not the overflow menu, is what is open now.
    expect(await screen.findByText("Rede local")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Aparência" })).toBeNull();
  });

  it("folds Adicionar's menu into the overflow menu on Windows, where the caption buttons take the room", async () => {
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("button", { name: "Mais ações de adição" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Mais opções" }));

    expect(screen.getByRole("menuitem", { name: "Importar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Exportar" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /^Adicionar/ }));
    expect(await screen.findByRole("dialog", { name: "Adicionar instant" })).toBeInTheDocument();

    delete window.instantsPlatform;
  });

  it("keeps Adicionar in the toolbar on macOS at the same width", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });

  it("badges the overflow menu when the server stops answering", () => {
    const bridge = installBridge();
    render(<App />);
    act(() => bridge.push([macbook]));

    expect(screen.getByRole("button", { name: "Mais opções" })).not.toHaveAttribute("data-attention");

    act(() => healthListener(false));

    expect(screen.getByRole("button", { name: "Mais opções" })).toHaveAttribute(
      "data-attention",
      "down"
    );
  });
});

describe("a wider window", () => {
  beforeEach(reset);

  it("keeps the server out of the overflow menu, where the chip already is", async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    render(<App />);
    act(() => bridge.push([macbook]));

    await user.click(screen.getByRole("button", { name: "Mais opções" }));

    expect(screen.queryByRole("menuitem", { name: /10\.0\.0\.133:9001/ })).toBeNull();
  });
});
