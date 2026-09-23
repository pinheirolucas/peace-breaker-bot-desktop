import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPresenceSettings } from "../../electron/presence";
import type { PresenceSettings } from "../../electron/presence";
import { useQuickAccessShortcut } from "../hooks/useQuickAccessShortcut";
import i18n from "../i18n";
import PresenceDialog from "./PresenceDialog";

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
  window.localStorage.clear();
});

function open(settings: Partial<PresenceSettings> = {}, os: "mac" | "win" | "linux" = "mac", modifiers = ["ctrl-alt" as const]) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <PresenceDialog
      open
      onOpenChange={onOpenChange}
      os={os}
      noTray={false}
      settings={{ ...defaultPresenceSettings, ...settings }}
      shortcut={{ enabled: false, modifier: null }}
      modifiers={modifiers}
      onConfirm={onConfirm}
    />
  );

  return { onConfirm, onOpenChange };
}

describe("PresenceDialog", () => {
  it("starts with everything off, and quick access disabled with its reason", () => {
    open();

    expect(screen.getByRole("switch", { name: "Show in the menu bar" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Quick access" })).toBeDisabled();
    expect(screen.getByText("Turn on the menu bar icon first.")).toBeInTheDocument();
  });

  it("keeps the shortcut off, and its combination dimmed, until asked", async () => {
    open({ tray: true, quickAccess: true });

    expect(screen.getByRole("switch", { name: "Global shortcut" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Global shortcut" })).toBeEnabled();
  });

  it("persists nothing until Pronto", async () => {
    const { onConfirm } = open();

    await userEvent.click(screen.getByRole("switch", { name: "Show in the menu bar" }));
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("switch", { name: "Quick access" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ tray: true, quickAccess: true }),
      expect.objectContaining({ enabled: false })
    );
  });

  it("cannot confirm quick access without the icon", async () => {
    const { onConfirm } = open({ tray: false, quickAccess: true });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onConfirm.mock.calls[0][0]).toMatchObject({ tray: false, quickAccess: false });
  });

  it("offers the sound's name on macOS and the background switch elsewhere", () => {
    const { unmount } = render(<div />);
    unmount();
    open({}, "mac");
    expect(screen.getByRole("switch", { name: "Show the sound's name beside the icon" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Keep running/ })).toBeNull();
  });

  it("offers the background switch on Windows", () => {
    open({}, "win");
    expect(screen.getByRole("switch", { name: /Keep running/ })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /beside the icon/ })).toBeNull();
  });

  it("leaves the shortcut rows out where none can be registered", () => {
    open({ tray: true, quickAccess: true }, "mac", []);
    expect(screen.queryByRole("switch", { name: "Global shortcut" })).toBeNull();
  });

  it("Cancelar drops the draft", async () => {
    const { onConfirm } = open();
    await userEvent.click(screen.getByRole("switch", { name: "Show in the menu bar" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("useQuickAccessShortcut", () => {
  afterEach(() => {
    delete window.instantsShortcuts;
    delete window.instantsQuickAccess;
  });

  function bridge(result: { registered: string[]; failed: { key: string; reason: string }[] }) {
    const setShortcut = vi.fn().mockResolvedValue(result);
    window.instantsShortcuts = { modifiers: ["ctrl-alt"], setGlobal: vi.fn(), onFired: () => () => {} };
    window.instantsQuickAccess = { action: vi.fn(), setShortcut: setShortcut as never, onShown: () => () => {} };
    return setShortcut;
  }

  it("registers only while it and quick access are on", async () => {
    window.localStorage.setItem("quickAccessShortcut", JSON.stringify({ enabled: true, modifier: null }));
    const setShortcut = bridge({ registered: ["p"], failed: [] });

    const { rerender } = renderHook(({ quickAccess }) => useQuickAccessShortcut(quickAccess, vi.fn()), { initialProps: { quickAccess: true } });
    await waitFor(() => expect(setShortcut).toHaveBeenLastCalledWith({ enabled: true, modifier: "ctrl-alt" }));

    rerender({ quickAccess: false });
    await waitFor(() => expect(setShortcut).toHaveBeenLastCalledWith({ enabled: false, modifier: "ctrl-alt" }));
  });

  it("snaps the switch back and says so when another app holds the combination", async () => {
    window.localStorage.setItem("quickAccessShortcut", JSON.stringify({ enabled: true, modifier: null }));
    bridge({ registered: [], failed: [{ key: "p", reason: "in-use" }] });
    const onTaken = vi.fn();

    renderHook(() => useQuickAccessShortcut(true, onTaken));

    await waitFor(() => expect(onTaken).toHaveBeenCalledTimes(1));
    expect(JSON.parse(window.localStorage.getItem("quickAccessShortcut") ?? "{}").enabled).toBe(false);
  });

  it("never asks for a registration while the switch is off", async () => {
    const setShortcut = bridge({ registered: [], failed: [] });
    const onTaken = vi.fn();

    renderHook(() => useQuickAccessShortcut(true, onTaken));

    await waitFor(() => expect(setShortcut).toHaveBeenCalledWith({ enabled: false, modifier: "ctrl-alt" }));
    expect(onTaken).not.toHaveBeenCalled();
  });
});
