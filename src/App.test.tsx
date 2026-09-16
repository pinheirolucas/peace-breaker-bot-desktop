import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { getMyInstants, resetApiUrl, setApiUrl } from "./service";

// The listeners App registers with the mocked service. Reset to no-ops
// rather than null, so a test can call them without a null check each time.
const noop = () => {};
let healthListener: (healthy: boolean) => void = noop;
let connectionErrorListener: () => void = noop;

// getApiUrl tracks what setApiUrl/resetApiUrl were last called with, so the
// resolution effect's own behaviour (adopt vs. reset to nothing) is what
// drives what the UI shows, not a value hardcoded independently of it.
let mockApiUrl: string | null = null;

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
  getMyInstants: vi.fn(() => Promise.resolve({ instants: [], pages: 0 }))
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
  vi.mocked(getMyInstants).mockClear();
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
    vi.mocked(getMyInstants).mockRejectedValueOnce(
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

    vi.mocked(getMyInstants).mockResolvedValue({ instants: [], pages: 0 });
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

  it("opens on Favoritos, with the section tabs and the search", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Favoritos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Favoritos" })).toHaveAttribute("aria-selected", "true");
    expect(searchBox()).toBeInTheDocument();
  });

  it("switches to MyInstants from the segmented control", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("tab", { name: "MyInstants" }));

    expect(screen.getByRole("heading", { level: 1, name: "MyInstants" })).toBeInTheDocument();
    await waitFor(() => expect(getMyInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("opens the add form from the tools row", async () => {
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

    expect(screen.getByRole("heading", { level: 1, name: "MyInstants" })).toBeInTheDocument();
    await waitFor(() => expect(getMyInstants).toHaveBeenLastCalledWith(1, "xuxa", "br"));
    // The query survives the switch, rather than making them retype it.
    expect(searchBox()).toHaveValue("xuxa");
  });

  it("focuses the search on the find shortcut", () => {
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

  async function openMyInstants() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "MyInstants" }));
    return user;
  }

  it("browses Brazil by default, and offers the region only on MyInstants", async () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "Brasil" })).toBeNull();

    await openMyInstants();

    expect(screen.getByRole("button", { name: "Brasil" })).toBeInTheDocument();
    await waitFor(() => expect(getMyInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("refetches the catalogue for a picked region and remembers it", async () => {
    render(<App />);
    const user = await openMyInstants();

    await user.click(screen.getByRole("button", { name: "Brasil" }));
    await user.click(screen.getByRole("menuitem", { name: "Portugal" }));

    await waitFor(() => expect(getMyInstants).toHaveBeenLastCalledWith(1, "", "pt"));
    expect(screen.getByRole("button", { name: "Portugal" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("region") ?? "null")).toBe("pt");
  });

  it("restores the stored region on the next launch", async () => {
    localStorage.setItem("region", JSON.stringify("us"));
    render(<App />);

    await openMyInstants();

    expect(screen.getByRole("button", { name: "Estados Unidos" })).toBeInTheDocument();
    await waitFor(() => expect(getMyInstants).toHaveBeenCalledWith(1, "", "us"));
  });

  it.each([
    ["an unknown code", JSON.stringify("zz")],
    ["an uppercase code", JSON.stringify("PT")],
    ["not a string", JSON.stringify(42)],
    ["corrupt JSON", "{not json"]
  ])("falls back to Brazil when the stored region is %s", async (_, raw) => {
    localStorage.setItem("region", raw);
    render(<App />);

    await openMyInstants();

    expect(screen.getByRole("button", { name: "Brasil" })).toBeInTheDocument();
    await waitFor(() => expect(getMyInstants).toHaveBeenCalledWith(1, "", "br"));
  });

  it("names regions in English once the language switches", async () => {
    localStorage.setItem("language", JSON.stringify("en-US"));
    localStorage.setItem("region", JSON.stringify("us"));
    render(<App />);

    await openMyInstants();

    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "United States" }));
    expect(screen.getByRole("menuitem", { name: "United Kingdom" })).toBeInTheDocument();
  });
});

describe("native window chrome", () => {
  beforeEach(() => {
    reset();
    delete document.documentElement.dataset.os;
    delete document.documentElement.dataset.chrome;
  });

  afterEach(() => {
    delete window.instantsPlatform;
  });

  it("draws its drag row when Electron merged the window into the macOS bar", () => {
    window.instantsPlatform = { os: "mac", chrome: "custom", setChrome: vi.fn() };

    const { container } = render(<App />);

    expect(container.querySelector(".tb")).not.toBeNull();
    expect(document.documentElement.dataset.os).toBe("mac");
    expect(document.documentElement.dataset.chrome).toBe("custom");
  });

  it("names the app in the Windows bar, beside the OS caption buttons", () => {
    window.instantsPlatform = { os: "win", chrome: "custom", setChrome: vi.fn() };

    const { container } = render(<App />);

    expect(container.querySelector(".tb")).toHaveTextContent("Peace Breaker Bot");
  });

  it("leaves the bar to the window manager on Linux", () => {
    window.instantsPlatform = { os: "linux", chrome: "native", setChrome: vi.fn() };

    const { container } = render(<App />);

    expect(container.querySelector(".tb")).toBeNull();
    expect(document.documentElement.dataset.chrome).toBe("native");
  });

  it("draws no title bar in a plain browser tab", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".tb")).toBeNull();
  });
});
