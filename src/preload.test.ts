import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exposed: Record<string, Record<string, unknown>> = {};
const handlers = new Map<string, (...args: unknown[]) => void>();

const ipcRenderer = {
  on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    handlers.set(channel, handler);
  }),
  removeListener: vi.fn((channel: string) => void handlers.delete(channel)),
  send: vi.fn(),
  invoke: vi.fn().mockResolvedValue({ registered: [], failed: [] })
};

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: Record<string, unknown>) => {
      exposed[name] = api;
    }
  },
  ipcRenderer
}));

type Bridge = {
  modifiers: string[];
  setGlobal: (request: unknown) => Promise<unknown>;
  onFired: (listener: (key: string) => void) => () => void;
};

async function loadBridge(platform: string): Promise<Bridge> {
  vi.resetModules();
  vi.stubGlobal("process", { ...process, platform, env: {} });
  await import("../electron/preload");
  return exposed.instantsShortcuts as unknown as Bridge;
}

describe("instantsShortcuts bridge", () => {
  beforeEach(() => handlers.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("offers the modifier presets of the OS it runs on, default first", async () => {
    expect((await loadBridge("darwin")).modifiers[0]).toBe("ctrl-alt");
    expect((await loadBridge("win32")).modifiers[0]).toBe("ctrl-alt-shift");
  });

  it("forwards a request to the main process over invoke", async () => {
    const bridge = await loadBridge("win32");
    const request = { enabled: true, modifier: "ctrl-alt-shift", keys: ["v"] };

    await bridge.setGlobal(request);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith("shortcuts:set", request);
  });

  it("passes a fired key to the listener and ignores anything that is not a string", async () => {
    const bridge = await loadBridge("win32");
    const listener = vi.fn();
    bridge.onFired(listener);

    handlers.get("shortcuts:fired")!({}, "v");
    handlers.get("shortcuts:fired")!({}, { evil: true });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("v");
  });

  it("unsubscribes, and hands back a no-op for a non-function listener", async () => {
    const bridge = await loadBridge("win32");

    bridge.onFired(vi.fn())();
    expect(handlers.has("shortcuts:fired")).toBe(false);

    expect(() => bridge.onFired("nope" as never)()).not.toThrow();
  });
});
