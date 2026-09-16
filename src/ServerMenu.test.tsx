import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ServerMenu, { formatApiUrl } from "./ServerMenu";
import type { Server } from "../electron/discovery";
import i18n from "./i18n";

function server(overrides: Partial<Server> = {}): Server {
  return {
    id: "raspberrypi.local-9001._myinstants._tcp.local",
    apiUrl: "http://10.0.0.42:9001",
    address: "10.0.0.42",
    port: 9001,
    hostname: "raspberrypi",
    isLocal: false,
    ...overrides
  };
}

function renderMenu(props: Partial<React.ComponentProps<typeof ServerMenu>> = {}) {
  const onOpenChange = vi.fn();
  const onSelect = vi.fn();
  const onRefresh = vi.fn();

  render(
    <ServerMenu
      servers={[]}
      currentApiUrl="http://localhost:9001"
      healthy={true}
      botStatus={null}
      open={true}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      onRefresh={onRefresh}
      {...props}
    />
  );

  return { onOpenChange, onSelect, onRefresh };
}

describe("formatApiUrl", () => {
  it("strips the scheme", () => {
    expect(formatApiUrl("http://10.0.0.42:9001")).toBe("10.0.0.42:9001");
    expect(formatApiUrl("https://10.0.0.42:9001")).toBe("10.0.0.42:9001");
  });

  it("passes through a value with no scheme", () => {
    expect(formatApiUrl("10.0.0.42:9001")).toBe("10.0.0.42:9001");
  });

  it("strips the api path, showing only the address the user can act on", () => {
    expect(formatApiUrl("http://10.0.0.42:9001/api/v1")).toBe("10.0.0.42:9001");
  });

  it("treats a falsy value as an empty string", () => {
    expect(formatApiUrl("")).toBe("");
  });
});

describe("ServerMenu", () => {
  it("shows the current address in its own header", () => {
    renderMenu({ currentApiUrl: "http://10.0.0.42:9001" });

    expect(screen.getByText("Conectado a")).toBeInTheDocument();
    expect(within(screen.getByRole("menu")).getByText("10.0.0.42:9001")).toBeInTheDocument();
  });

  it("drops the header entirely when nothing is active, rather than repeat the empty list's own message", () => {
    renderMenu({ currentApiUrl: null, healthy: false, servers: [] });

    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("Conectado a")).not.toBeInTheDocument();
    // Said once, by the empty-list item below — not doubled by a header
    // that would only ever say the same thing at the same time.
    expect(within(menu).getAllByText("Nenhum servidor encontrado")).toHaveLength(1);
  });

  it("names no server on the chip, with no 'not responding' suffix to attach to it", () => {
    renderMenu({ currentApiUrl: null, healthy: false, open: false });

    expect(screen.getByRole("button", { name: "Nenhum servidor encontrado" })).toBeInTheDocument();
  });

  it("ticks the server that matches the current address", () => {
    const macbook = server({ id: "a", apiUrl: "http://10.0.0.1:9001", hostname: "MacBook", isLocal: true });
    const raspberry = server({ id: "b", apiUrl: "http://10.0.0.2:9001", hostname: "raspberrypi" });
    renderMenu({ servers: [macbook, raspberry], currentApiUrl: "http://10.0.0.2:9001" });

    const items = screen.getAllByRole("menuitem");
    const current = items.find((item) => within(item).queryByText("10.0.0.2:9001"));
    const other = items.find((item) => within(item).queryByText("10.0.0.1:9001"));

    expect(current!.querySelector(".mtick svg")).not.toBeNull();
    expect(other!.querySelector(".mtick svg")).toBeNull();
  });

  it("marks a local server by its hostname", () => {
    renderMenu({ servers: [server({ hostname: "MacBook-Pro-de-Lucas", isLocal: true })] });

    expect(screen.getByText("MacBook-Pro-de-Lucas · este computador")).toBeInTheDocument();
  });

  it("marks a local server with no hostname as 'this computer' outright", () => {
    renderMenu({ servers: [server({ hostname: null, isLocal: true })] });

    expect(screen.getByText("Este computador")).toBeInTheDocument();
  });

  it("shows a remote server with no hostname by address alone", () => {
    renderMenu({ servers: [server({ hostname: null, isLocal: false })] });

    const item = screen.getByText(formatApiUrl(server().apiUrl)).closest("[role='menuitem']");
    expect(within(item as HTMLElement).queryByText("·", { exact: false })).toBeNull();
  });

  it("says so when nothing was discovered", () => {
    renderMenu({ servers: [] });

    expect(screen.getByText("Nenhum servidor encontrado")).toBeInTheDocument();
    expect(screen.getByText("A busca é bloqueada em muitas redes")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked server, and keeps the menu open", async () => {
    const user = userEvent.setup();
    const picked = server({ apiUrl: "http://10.0.0.2:9001", hostname: "raspberrypi" });
    const { onSelect, onOpenChange } = renderMenu({ servers: [picked] });

    await user.click(screen.getByText("10.0.0.2:9001"));

    expect(onSelect).toHaveBeenCalledWith(picked);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("calls onRefresh from the trailing item, and keeps the menu open", async () => {
    const user = userEvent.setup();
    const { onRefresh, onOpenChange } = renderMenu();

    await user.click(screen.getByText("Procurar novamente"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("passes an unhealthy state through to the chip's accessible name", () => {
    renderMenu({ currentApiUrl: "http://localhost:9001", healthy: false, open: false });

    expect(
      screen.getByRole("button", { name: "localhost:9001 não está respondendo" })
    ).toBeInTheDocument();
  });

  // The chip/menu's third state: server reachable, bot confirmed to have
  // no voice connection. Never on an unknown status — the regression this
  // guards is the gate condition collapsing null into connected:false.
  describe("bot voice status", () => {
    it("names the address plus the not-in-voice fragment when the bot is confirmed away", () => {
      renderMenu({
        currentApiUrl: "http://localhost:9001",
        healthy: true,
        botStatus: { connected: false },
        open: false
      });

      expect(
        screen.getByRole("button", { name: "localhost:9001 · bot fora de um canal de voz" })
      ).toBeInTheDocument();
    });

    it("names the address plus guild and channel once both resolve", () => {
      renderMenu({
        currentApiUrl: "http://localhost:9001",
        healthy: true,
        botStatus: { connected: true, guildName: "Peace Breakers", channelName: "geral" },
        open: false
      });

      expect(
        screen.getByRole("button", { name: "localhost:9001 · Peace Breakers #geral" })
      ).toBeInTheDocument();
    });

    it("keeps the plain address, with no aria-label override, while the status is unknown", () => {
      renderMenu({
        currentApiUrl: "http://localhost:9001",
        healthy: true,
        botStatus: null,
        open: false
      });

      expect(screen.getByRole("button", { name: "localhost:9001" })).toBeInTheDocument();
    });

    it("keeps the plain address when connected but the names haven't resolved yet", () => {
      renderMenu({
        currentApiUrl: "http://localhost:9001",
        healthy: true,
        botStatus: { connected: true },
        open: false
      });

      expect(screen.getByRole("button", { name: "localhost:9001" })).toBeInTheDocument();
    });

    it("shows the not-in-voice fragment as the header's second line", () => {
      renderMenu({
        currentApiUrl: "http://10.0.0.42:9001",
        healthy: true,
        botStatus: { connected: false }
      });

      const header = screen.getByText("Conectado a").closest(".mhead")! as HTMLElement;
      expect(within(header).getByText("bot fora de um canal de voz")).toBeInTheDocument();
    });

    it("shows the guild and channel as the header's second line once resolved", () => {
      renderMenu({
        currentApiUrl: "http://10.0.0.42:9001",
        healthy: true,
        botStatus: { connected: true, guildName: "Peace Breakers", channelName: "geral" }
      });

      const header = screen.getByText("Conectado a").closest(".mhead")! as HTMLElement;
      expect(within(header).getByText("Peace Breakers · #geral")).toBeInTheDocument();
    });

    it("shows no second line at all when the status is unknown", () => {
      renderMenu({
        currentApiUrl: "http://10.0.0.42:9001",
        healthy: true,
        botStatus: null
      });

      const header = screen.getByText("Conectado a").closest(".mhead")! as HTMLElement;
      expect(within(header).queryByText(/canal de voz|·/)).not.toBeInTheDocument();
    });

    it("shows no second line when connected but the names haven't resolved yet", () => {
      renderMenu({
        currentApiUrl: "http://10.0.0.42:9001",
        healthy: true,
        botStatus: { connected: true }
      });

      const header = screen.getByText("Conectado a").closest(".mhead")! as HTMLElement;
      expect(within(header).queryByText(/canal de voz|·/)).not.toBeInTheDocument();
    });

    it("shows no second line while the server itself is unresponsive, even with a stale bot status", () => {
      renderMenu({
        currentApiUrl: "http://10.0.0.42:9001",
        healthy: false,
        botStatus: { connected: false }
      });

      const header = screen.getByText("Conectado a").closest(".mhead")! as HTMLElement;
      expect(within(header).queryByText(/canal de voz|·/)).not.toBeInTheDocument();
    });
  });

  describe("under en-US", () => {
    afterEach(async () => {
      await i18n.changeLanguage("pt-BR");
    });

    it("renders its own copy in English", async () => {
      await i18n.changeLanguage("en-US");
      renderMenu({ servers: [] });

      expect(screen.getByText("Connected to")).toBeInTheDocument();
      expect(screen.getByText("No servers found")).toBeInTheDocument();
      expect(screen.getByText("Search again")).toBeInTheDocument();
    });
  });
});
