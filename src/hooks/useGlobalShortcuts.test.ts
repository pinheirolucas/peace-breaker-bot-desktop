import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

let fired: (key: string) => void = () => undefined;

function installBridge(failed: { key: string; reason: "in-use" }[] = []) {
  const setGlobal = vi.fn().mockResolvedValue({ registered: [], failed });
  window.instantsShortcuts = {
    modifiers: ["ctrl-alt-shift", "ctrl-shift", "super-alt"],
    setGlobal,
    onFired: (listener) => {
      fired = listener;
      return () => undefined;
    }
  };
  return setGlobal;
}

function options(overrides = {}) {
  return {
    keys: ["v", "b"],
    onFire: vi.fn(),
    onStatus: vi.fn(),
    onSetupFailed: vi.fn(),
    ...overrides
  };
}

describe("useGlobalShortcuts", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    delete window.instantsShortcuts;
    localStorage.clear();
  });

  it("does nothing without the Electron bridge", () => {
    const opts = options();
    renderHook(() => useGlobalShortcuts(opts));
    expect(opts.onStatus).not.toHaveBeenCalled();
  });

  it("releases everything while the switch is off, which is the default", async () => {
    const setGlobal = installBridge();
    renderHook(() => useGlobalShortcuts(options()));

    await waitFor(() => expect(setGlobal).toHaveBeenCalledTimes(1));
    expect(setGlobal).toHaveBeenCalledWith({
      enabled: false,
      modifier: "ctrl-alt-shift",
      keys: []
    });
  });

  it("sends the sorted keys once, and not again for a re-render", async () => {
    localStorage.setItem("globalShortcuts", JSON.stringify({ enabled: true, modifier: null }));
    const setGlobal = installBridge();
    const { rerender } = renderHook(() => useGlobalShortcuts(options()));

    await waitFor(() => expect(setGlobal).toHaveBeenCalledTimes(1));
    expect(setGlobal).toHaveBeenCalledWith({
      enabled: true,
      modifier: "ctrl-alt-shift",
      keys: ["b", "v"]
    });

    rerender();
    rerender();
    expect(setGlobal).toHaveBeenCalledTimes(1);
  });

  it("falls back to the OS default for a modifier this OS does not offer", async () => {
    localStorage.setItem("globalShortcuts", JSON.stringify({ enabled: true, modifier: "cmd-alt" }));
    const setGlobal = installBridge();
    renderHook(() => useGlobalShortcuts(options()));

    await waitFor(() => expect(setGlobal).toHaveBeenCalled());
    expect(setGlobal.mock.calls[0][0].modifier).toBe("ctrl-alt-shift");
  });

  it("hands a fired key to the caller", () => {
    installBridge();
    const opts = options();
    renderHook(() => useGlobalShortcuts(opts));

    act(() => fired("v"));
    expect(opts.onFire).toHaveBeenCalledWith("v");
  });

  it("reports failures only when the setup changed, not the first time", async () => {
    localStorage.setItem("globalShortcuts", JSON.stringify({ enabled: true, modifier: null }));
    installBridge([{ key: "v", reason: "in-use" }]);
    const opts = options();
    renderHook(() => useGlobalShortcuts(opts));

    await waitFor(() => expect(opts.onStatus).toHaveBeenCalled());
    expect(opts.onSetupFailed).not.toHaveBeenCalled();
  });
});
