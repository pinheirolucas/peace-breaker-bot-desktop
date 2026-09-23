import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPresence } from "../electron/presence";
import type { PresenceSnapshot } from "../electron/presence";
import { PresenceStrip, stripTone } from "./components/PresenceStrip";
import { PanelConnection, PanelFavorites } from "./components/QuickPanelViews";
import type { PanelFavoritesProps } from "./components/QuickPanelViews";
import { usePresenceSettings } from "./hooks/usePresence";
import i18n from "./i18n";
import QuickPanel from "./QuickPanel";

const server = "http://192.168.0.5:9001/api/v1";
const snap = (patch: Partial<PresenceSnapshot> = {}): PresenceSnapshot => ({
  ...emptyPresence,
  server,
  ...patch
});
const playing = { mode: "local" as const, name: "Vine boom", since: 1 };

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
  window.localStorage.clear();
});

describe("stripTone", () => {
  it("reads the same three colours as the window's chip, and grey for unknown", () => {
    expect(stripTone(snap({ bot: { connected: true } }))).toBe("ok");
    expect(stripTone(snap({ bot: { connected: false } }))).toBe("warn");
    expect(stripTone(snap({ silent: true }))).toBe("down");
    expect(stripTone(snap())).toBe("unknown");
    expect(stripTone(emptyPresence)).toBe("unknown");
  });
});

describe("PresenceStrip", () => {
  function strip(snapshot: PresenceSnapshot, pinned = false) {
    const onStop = vi.fn();
    const onPin = vi.fn();
    render(<PresenceStrip snapshot={snapshot} pinned={pinned} onStop={onStop} onPin={onPin} menu={null} />);
    return { onStop, onPin };
  }

  it("keeps Stop in place but disabled while idle", () => {
    strip(snap({ bot: { connected: true, guildName: "Casa", channelName: "geral" } }));

    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Casa · #geral");
    expect(screen.getByRole("status")).toHaveTextContent("192.168.0.5:9001");
  });

  it("enables Stop while something plays, and says what", async () => {
    const { onStop } = strip(snap({ bot: { connected: true }, playing }));

    expect(screen.getByRole("status")).toHaveTextContent("Playing: Vine boom");
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("says a silent server is silent, and none is none", () => {
    strip(snap({ silent: true }));
    expect(screen.getByRole("status")).toHaveTextContent("Server is not responding");
  });

  it("pins with aria-pressed", async () => {
    const { onPin } = strip(snap(), true);
    const pin = screen.getByRole("button", { name: "Keep panel open" });

    expect(pin).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(pin);
    expect(onPin).toHaveBeenCalled();
  });
});

describe("PanelFavorites", () => {
  const instants = [
    { name: "Vine boom", url: "https://x/a.mp3" },
    { name: "Airhorn", url: "https://x/b.mp3" }
  ];

  function view(props: Partial<PanelFavoritesProps> = {}) {
    const handlers = {
      onPlay: vi.fn(),
      onOpenApp: vi.fn(),
      onRetry: vi.fn(),
      onQuery: vi.fn()
    };
    render(
      <PanelFavorites
        instants={instants}
        total={2}
        query=""
        playbackOf={() => "idle"}
        otherPlaying={false}
        botStatus={null}
        offline={false}
        matchUrl={null}
        hint={false}
        {...handlers}
        {...props}
      />
    );
    return handlers;
  }

  it("draws the favourites as cards, with a count and a way to the app", async () => {
    const { onOpenApp } = view();

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("2 favorites")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Open app/ }));
    expect(onOpenApp).toHaveBeenCalled();
  });

  it("plays a card's body through onPlay", async () => {
    const { onPlay } = view();

    await userEvent.click(within(screen.getByRole("article", { name: "Airhorn" })).getByRole("button", { name: "Airhorn" }));
    expect(onPlay).toHaveBeenCalledWith(instants[1]);
  });

  it("has the body as its only control: no send or stop on a card", () => {
    view({ playbackOf: (instant) => (instant === instants[0] ? "local" : "idle"), otherPlaying: true });

    const card = screen.getByRole("article", { name: "Vine boom" });
    expect(within(card).getAllByRole("button")).toHaveLength(1);
    expect(within(card).getByRole("button", { name: "Vine boom" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Send|Stop/ })).not.toBeInTheDocument();
    expect(card).toHaveAttribute("data-live", "true");
    expect(screen.getByRole("article", { name: "Airhorn" })).toHaveAttribute("data-dim", "true");
  });

  it("keeps the body live when the bot is out of its channel, as cardState says", () => {
    view({ botStatus: { connected: false } });
    expect(within(screen.getByRole("article", { name: "Airhorn" })).getByRole("button", { name: "Airhorn" })).toBeEnabled();
  });

  it("puts the footer beside the scroller, not inside it, so only the grid scrolls", () => {
    view({ offline: true, hint: true });

    const body = document.querySelector(".pbody") as HTMLElement;
    const scroll = body.querySelector(".scroll") as HTMLElement;
    expect(scroll.querySelector(".pfooter, .psearch, .banner, .phint")).toBeNull();
    for (const selector of [".psearch", ".banner", ".phint", ".pfooter"]) {
      expect(body.querySelector(selector)?.parentElement).toBe(body);
    }
  });

  it("marks the first match", () => {
    view({ query: "vin", instants: [instants[0]], matchUrl: instants[0].url });
    expect(screen.getByRole("article", { name: "Vine boom" })).toHaveAttribute("data-match", "true");
  });

  it("ends every empty state on a next step", async () => {
    const { onQuery } = view({ instants: [], query: "zzz" });
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onQuery).toHaveBeenCalledWith("");
  });

  it("offers the app when there are no favourites at all", () => {
    view({ instants: [], total: 0 });
    expect(screen.getByText("No favorites yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open app" }).length).toBeGreaterThan(0);
  });

  it("keeps every button live while the server is silent", () => {
    view({ offline: true });
    expect(screen.getByRole("status")).toHaveTextContent("Server is not responding");
    expect(within(screen.getByRole("article", { name: "Airhorn" })).getByRole("button", { name: "Airhorn" })).toBeEnabled();
  });

  it("shows the drag hint only when asked", () => {
    view({ hint: true });
    expect(screen.getByText(/Drag a sound into any app/)).toBeInTheDocument();
  });
});

describe("PanelConnection", () => {
  const servers = [
    { id: "a", apiUrl: "http://192.168.0.5:9001/api/v1", address: "192.168.0.5", port: 9001, hostname: "mac.local", isLocal: true },
    { id: "b", apiUrl: "http://192.168.0.9:9001/api/v1", address: "192.168.0.9", port: 9001, hostname: "nas", isLocal: false }
  ];

  function view(props: Partial<React.ComponentProps<typeof PanelConnection>> = {}) {
    const onSelect = vi.fn();
    const onSearch = vi.fn();
    render(
      <PanelConnection
        servers={servers}
        activeUrl={servers[0].apiUrl}
        healthy
        searching={false}
        onSelect={onSelect}
        onSearch={onSearch}
        onOpenApp={vi.fn()}
        {...props}
      />
    );
    return { onSelect, onSearch };
  }

  it("lists servers as a radio group, the active one checked and marked", () => {
    view();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[0]).toHaveTextContent("this computer");
    expect(radios[1]).not.toBeChecked();
    expect(screen.getByText("in use")).toBeInTheDocument();
  });

  it("switches in one click", async () => {
    const { onSelect } = view();
    await userEvent.click(screen.getAllByRole("radio")[1]);
    expect(onSelect).toHaveBeenCalledWith(servers[1]);
  });

  it("keeps a dead active server as the first row", () => {
    view({ servers: [servers[1]], activeUrl: "http://10.0.0.7:9001/api/v1", healthy: false });

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveTextContent("10.0.0.7:9001");
    expect(radios[0]).toBeChecked();
  });

  it("searches again, and is inert while it does", async () => {
    const { onSearch } = view();
    await userEvent.click(screen.getByRole("button", { name: /Search again/ }));
    expect(onSearch).toHaveBeenCalled();
  });

  it("says Procurando while searching", () => {
    view({ searching: true });
    expect(screen.getByRole("button", { name: /Searching…/ })).toBeDisabled();
  });

  it("ends the empty state on a next step", async () => {
    const { onSearch } = view({ servers: [], activeUrl: null });

    expect(screen.getByText("No servers found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Search again/ }));
    expect(onSearch).toHaveBeenCalled();
  });
});

describe("usePresenceSettings", () => {
  it("defaults to everything off, favourites style, listen here", () => {
    const { result } = renderHook(() => usePresenceSettings());

    expect(result.current.settings).toEqual({
      tray: false,
      panel: false,
      panelStyle: "favorites",
      panelClick: "local",
      title: false,
      background: false
    });
  });

  it("fills in what a stored value lacks", () => {
    window.localStorage.setItem("presence", JSON.stringify({ tray: true, panelStyle: "connection" }));
    const { result } = renderHook(() => usePresenceSettings());

    expect(result.current.settings).toMatchObject({ tray: true, panelStyle: "connection", panelClick: "local" });
  });

  it("falls back to the default style for one it does not know", () => {
    window.localStorage.setItem("presence", JSON.stringify({ tray: true, panelStyle: "wide" }));
    const { result } = renderHook(() => usePresenceSettings());

    expect(result.current.settings.panelStyle).toBe("favorites");
  });

  it("the panel needs the icon: without it the effective settings turn it off", () => {
    window.localStorage.setItem("presence", JSON.stringify({ tray: false, panel: true, title: true }));
    const { result } = renderHook(() => usePresenceSettings());

    expect(result.current.settings.panel).toBe(true);
    expect(result.current.effective).toMatchObject({ panel: false, title: false });
  });
});

describe("QuickPanel", () => {
  beforeEach(() => {
    // The panel follows the stored language, like the window.
    window.localStorage.setItem("language", JSON.stringify("en-US"));
  });

  afterEach(() => {
    delete window.instantsPanel;
    delete window.instantsPresence;
  });

  function bridges() {
    const action = vi.fn();
    const stop = vi.fn();
    window.instantsPanel = { action, setShortcut: vi.fn(), onShown: () => () => {} };
    window.instantsPresence = {
      setServer: vi.fn(),
      setPlaying: vi.fn(),
      setSettings: vi.fn(),
      stop,
      onSnapshot: (listener) => {
        listener(snap({ bot: { connected: true }, playing }));
        return () => {};
      }
    };
    return { action, stop };
  }

  it("Esc stops what plays before it does anything else", () => {
    const { action, stop } = bridges();
    render(<QuickPanel />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalledWith({ type: "hide" });
  });

  it("Esc hides when nothing plays and nothing is typed", () => {
    const { action } = bridges();
    window.instantsPresence!.onSnapshot = (listener) => {
      listener(snap({ bot: { connected: true } }));
      return () => {};
    };
    render(<QuickPanel />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(action).toHaveBeenCalledWith({ type: "hide" });
  });

  it("opens in the style the setting says, and switches live", () => {
    window.localStorage.setItem("presence", JSON.stringify({ tray: true, panel: true, panelStyle: "connection" }));
    bridges();
    render(<QuickPanel />);

    expect(screen.getByText("No servers found")).toBeInTheDocument();
    expect(screen.queryByText("No favorites yet")).toBeNull();

    act(() => {
      window.localStorage.setItem("presence", JSON.stringify({ tray: true, panel: true, panelStyle: "favorites" }));
      window.dispatchEvent(new StorageEvent("storage", {
          key: "presence",
          newValue: window.localStorage.getItem("presence"),
          storageArea: window.localStorage
        }));
    });

    expect(screen.queryByText("No servers found")).toBeNull();
    expect(screen.getByText("No favorites yet")).toBeInTheDocument();
  });
});
