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

type MenuBridge = {
  setState: (state: unknown) => void;
  onCommand: (listener: (command: unknown) => void) => () => void;
  cardContext: (context: unknown) => void;
  gridContext: () => void;
  serverContext: () => void;
  serverRowContext: (id: string) => void;
  selectionContext: () => void;
};

describe("instantsMenu bridge", () => {
  async function load(): Promise<MenuBridge> {
    vi.resetModules();
    vi.stubGlobal("process", { ...process, platform: "darwin", env: {} });
    await import("../electron/preload");
    return exposed.instantsMenu as unknown as MenuBridge;
  }

  beforeEach(() => {
    handlers.clear();
    ipcRenderer.send.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends state and each popup request to main on its own channel", async () => {
    const bridge = await load();

    bridge.setState({ tab: "favorites" });
    bridge.cardContext({ url: "u" });
    bridge.gridContext();
    bridge.serverContext();
    bridge.serverRowContext("http://a:9001");
    bridge.selectionContext();

    expect(ipcRenderer.send.mock.calls).toEqual([
      ["menu:state", { tab: "favorites" }],
      ["menu:card", { url: "u" }],
      ["menu:grid"],
      ["menu:server"],
      ["menu:server-row", { id: "http://a:9001" }],
      ["menu:selection"]
    ]);
  });

  it("hands the listener only commands it recognises", async () => {
    const bridge = await load();
    const listener = vi.fn();
    bridge.onCommand(listener);

    handlers.get("menu:command")!({}, { type: "tab", tab: "explore" });
    handlers.get("menu:command")!({}, { type: "eval", code: "x" });
    handlers.get("menu:command")!({}, "find");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: "tab", tab: "explore" });
  });

  it("unsubscribes, and hands back a no-op for a non-function listener", async () => {
    const bridge = await load();

    bridge.onCommand(vi.fn())();
    expect(handlers.has("menu:command")).toBe(false);
    expect(() => bridge.onCommand("nope" as never)()).not.toThrow();
  });
});
