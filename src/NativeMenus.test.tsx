import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MenuCommand, MenuState } from "../electron/menuState";
import App from "./App";
import InstantCard from "./components/InstantCard";

// Every component that subscribes gets each command, as with the real bridge.
const listeners = new Set<(command: MenuCommand) => void>();
const send = (command: MenuCommand) => listeners.forEach((listener) => listener(command));

function installMenuBridge() {
  const bridge = {
    setState: vi.fn<(state: MenuState) => void>(),
    onCommand: vi.fn((listener: (command: MenuCommand) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }),
    cardContext: vi.fn(),
    gridContext: vi.fn(),
    serverContext: vi.fn(),
    serverRowContext: vi.fn(),
    selectionContext: vi.fn()
  };
  window.instantsMenu = bridge;
  return bridge;
}

const lastState = (bridge: ReturnType<typeof installMenuBridge>) =>
  bridge.setState.mock.calls.at(-1)![0];

const clip = { name: "Vine boom", url: "https://www.myinstants.com/pt/instant/vine-boom/", key: "a" };

describe("native menus in the renderer", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    delete window.instantsMenu;
    localStorage.clear();
  });

  it("reports state on change, and runs a command through the same handler as the button", async () => {
    const bridge = installMenuBridge();
    render(<App />);

    expect(lastState(bridge)).toMatchObject({
      tab: "favorites",
      playing: null,
      botConnected: null,
      organizing: false,
      hasFavorites: false,
      language: "pt-BR"
    });

    act(() => send({ type: "tab", tab: "explore" }));
    expect(lastState(bridge).tab).toBe("explore");

    act(() => send({ type: "add" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("holds a window command back while a dialog is open", () => {
    const bridge = installMenuBridge();
    render(<App />);

    act(() => send({ type: "add" }));
    act(() => send({ type: "tab", tab: "explore" }));

    expect(lastState(bridge).tab).toBe("favorites");
    expect(lastState(bridge).blocked).toBe(true);
  });

  it("leaves Cmd/Ctrl + key to the accelerators, so nothing fires twice", () => {
    installMenuBridge();
    render(<App />);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: "2", ctrlKey: true, metaKey: true });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("tab", { name: "Favoritos" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the key handlers in a plain browser tab, which has no menu bar", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "2", ctrlKey: true, metaKey: true });

    expect(screen.getByRole("tab", { name: "Explorar" })).toHaveAttribute("aria-selected", "true");
  });

  it("suppresses the browser's context menu outside a field, and asks for the grid's over IPC", () => {
    const bridge = installMenuBridge();
    render(<App />);

    const grid = document.querySelector("main.scroll")!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    grid.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.gridContext).toHaveBeenCalledTimes(1);
  });

  it("leaves a text field's context menu to main", () => {
    const bridge = installMenuBridge();
    render(<App />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(bridge.gridContext).not.toHaveBeenCalled();
    input.remove();
  });

  it("does not open the page menu behind a dialog", () => {
    const bridge = installMenuBridge();
    render(<App />);

    act(() => send({ type: "add" }));
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("main.scroll")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.gridContext).not.toHaveBeenCalled();
  });

  it("sends a card's own state with its right-click, from cardState", () => {
    const bridge = installMenuBridge();
    render(
      <InstantCard
        instant={clip}
        playback="idle"
        otherPlaying
        botStatus={{ connected: false } as never}
        onPlay={vi.fn()}
        onPlayOnDiscord={vi.fn()}
        onStop={vi.fn()}
        trail={{ label: "Remover", icon: null, onClick: vi.fn() }}
        menu={{ surface: "favorites", index: 2, total: 5, favorite: true, providerName: "" }}
      />
    );

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("article", { name: "Vine boom" }).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.cardContext).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "favorites",
        url: clip.url,
        key: "a",
        playback: "idle",
        index: 2,
        total: 5,
        state: expect.objectContaining({ playDisabled: true, discordDisabled: true, botGated: true })
      })
    );
  });

  it("gives a card no native menu in a browser tab", () => {
    render(
      <InstantCard
        instant={clip}
        playback="idle"
        otherPlaying={false}
        botStatus={null}
        onPlay={vi.fn()}
        onPlayOnDiscord={vi.fn()}
        onStop={vi.fn()}
        trail={{ label: "Remover", icon: null, onClick: vi.fn() }}
        menu={{ surface: "favorites", index: 0, total: 1, favorite: true, providerName: "" }}
      />
    );

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("article", { name: "Vine boom" }).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
