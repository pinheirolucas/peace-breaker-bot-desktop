import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShortcutRegistry,
  shortcutDebounceMs,
  shouldHideOnClose
} from "../electron/shortcutRegistry";
import { shortcutsFiredChannel } from "../electron/shortcuts";
import type { ShortcutRequest } from "../electron/shortcuts";

const request: ShortcutRequest = { enabled: true, modifier: "ctrl-alt-shift", keys: ["v", "b"] };

function setup({ taken = [] as string[], wayland = false } = {}) {
  const callbacks = new Map<string, () => void>();
  const registry = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (taken.includes(accelerator)) return false;
      callbacks.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => void callbacks.delete(accelerator))
  };
  const send = vi.fn();
  let time = 1_000;
  const shortcuts = createShortcutRegistry({ registry, send, wayland, now: () => time });

  return {
    shortcuts,
    registry,
    send,
    callbacks,
    advance: (ms: number) => (time += ms)
  };
}

describe("createShortcutRegistry", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("registers every key as an accelerator and reports them", () => {
    const result = ctx.shortcuts.apply(request);

    expect(result).toEqual({ registered: ["v", "b"], failed: [] });
    expect(ctx.registry.register.mock.calls.map(([accelerator]) => accelerator)).toEqual([
      "Control+Alt+Shift+V",
      "Control+Alt+Shift+B"
    ]);
    expect(ctx.shortcuts.enabled).toBe(true);
  });

  it("collects a combo another app holds instead of throwing", () => {
    ctx = setup({ taken: ["Control+Alt+Shift+V"] });

    expect(ctx.shortcuts.apply(request)).toEqual({
      registered: ["b"],
      failed: [{ key: "v", reason: "in-use" }]
    });
  });

  it("treats a register call that throws as a failure", () => {
    ctx.registry.register.mockImplementationOnce(() => {
      throw new Error("bad accelerator");
    });

    expect(ctx.shortcuts.apply(request).failed).toEqual([{ key: "v", reason: "in-use" }]);
  });

  it("sends the key back when a combo fires", () => {
    ctx.shortcuts.apply(request);
    ctx.callbacks.get("Control+Alt+Shift+V")!();

    expect(ctx.send).toHaveBeenCalledWith(shortcutsFiredChannel, "v");
  });

  it("drops a repeat inside the debounce window, per key", () => {
    ctx.shortcuts.apply(request);
    const v = ctx.callbacks.get("Control+Alt+Shift+V")!;
    const b = ctx.callbacks.get("Control+Alt+Shift+B")!;

    v();
    ctx.advance(shortcutDebounceMs - 1);
    v();
    b();
    expect(ctx.send).toHaveBeenCalledTimes(2);

    ctx.advance(1);
    v();
    expect(ctx.send).toHaveBeenCalledTimes(3);
  });

  it("releases only what it registered when the request changes", () => {
    ctx = setup({ taken: ["Control+Alt+Shift+V"] });
    ctx.shortcuts.apply(request);
    ctx.shortcuts.apply({ ...request, keys: ["z"] });

    expect(ctx.registry.unregister).toHaveBeenCalledTimes(1);
    expect(ctx.registry.unregister).toHaveBeenCalledWith("Control+Alt+Shift+B");
  });

  it("releases everything and registers nothing when turned off", () => {
    ctx.shortcuts.apply(request);
    const result = ctx.shortcuts.apply({ ...request, enabled: false });

    expect(result).toEqual({ registered: [], failed: [] });
    expect(ctx.registry.unregister).toHaveBeenCalledTimes(2);
    expect(ctx.shortcuts.enabled).toBe(false);
  });

  it("reset releases everything and marks global keys off", () => {
    ctx.shortcuts.apply(request);
    ctx.shortcuts.reset();

    expect(ctx.registry.unregister).toHaveBeenCalledTimes(2);
    expect(ctx.shortcuts.enabled).toBe(false);
  });

  it("reports Wayland with nothing registered as unsupported, not in use", () => {
    ctx = setup({ wayland: true, taken: ["Control+Alt+Shift+V", "Control+Alt+Shift+B"] });

    expect(ctx.shortcuts.apply(request).failed).toEqual([
      { key: "v", reason: "unsupported" },
      { key: "b", reason: "unsupported" }
    ]);
  });

  it("keeps a plain in-use failure on Wayland when something did register", () => {
    ctx = setup({ wayland: true, taken: ["Control+Alt+Shift+V"] });

    expect(ctx.shortcuts.apply(request).failed).toEqual([{ key: "v", reason: "in-use" }]);
  });
});

describe("shouldHideOnClose", () => {
  it("hides only on macOS, with global keys on, and not while quitting", () => {
    expect(shouldHideOnClose("darwin", true, false)).toBe(true);
    expect(shouldHideOnClose("darwin", false, false)).toBe(false);
    expect(shouldHideOnClose("darwin", true, true)).toBe(false);
    expect(shouldHideOnClose("win32", true, false)).toBe(false);
    expect(shouldHideOnClose("linux", true, false)).toBe(false);
  });
});
