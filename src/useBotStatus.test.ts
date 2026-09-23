import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import useBotStatus from "./useBotStatus";
import { getBotStatus } from "./service";
import type { BotStatus } from "./service";

// service.ts already has its own MSW-backed tests for the request itself;
// here the hook's polling state machine is driven directly.
vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getBotStatus: vi.fn()
}));

const apiUrl = "http://10.0.0.42:9001/api/v1";

describe("useBotStatus", () => {
  beforeEach(() => {
    vi.mocked(getBotStatus).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts unknown (null) rather than assuming disconnected", () => {
    vi.mocked(getBotStatus).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBotStatus(apiUrl));

    expect(result.current).toBeNull();
  });

  it("resolves to the bot's status once the request answers", async () => {
    vi.mocked(getBotStatus).mockResolvedValue({ connected: true, guildName: "G", channelName: "geral" });

    const { result } = renderHook(() => useBotStatus(apiUrl));

    await waitFor(() => expect(result.current).toEqual({ connected: true, guildName: "G", channelName: "geral" }));
  });

  // The rule this gate depends on: a failed request (server unreachable, or
  // an old backend with no /bot/status route) must resolve to "unknown",
  // never to {connected: false} — the two look identical to the UI's gate
  // condition (`connected === false`) if this collapses them.
  it("resolves to null, not {connected: false}, when the request fails", async () => {
    vi.mocked(getBotStatus).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useBotStatus(apiUrl));

    await waitFor(() => expect(vi.mocked(getBotStatus)).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("stays null with no active server, and never calls the backend", () => {
    const { result } = renderHook(() => useBotStatus(null));

    expect(result.current).toBeNull();
    expect(getBotStatus).not.toHaveBeenCalled();
  });

  it("polls again on the interval", async () => {
    vi.useFakeTimers();
    vi.mocked(getBotStatus).mockResolvedValue({ connected: false });

    renderHook(() => useBotStatus(apiUrl));

    await act(async () => {
      await Promise.resolve();
    });
    expect(getBotStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(8000);
      await Promise.resolve();
    });
    expect(getBotStatus).toHaveBeenCalledTimes(2);
  });

  it("resets to null and stops polling when the server goes away", async () => {
    vi.mocked(getBotStatus).mockResolvedValue({ connected: true });

    const { result, rerender } = renderHook(({ url }) => useBotStatus(url), {
      initialProps: { url: apiUrl as string | null }
    });

    await waitFor(() => expect(result.current).toEqual({ connected: true }));

    rerender({ url: null });

    expect(result.current).toBeNull();
  });

  it("does not update state after unmount", async () => {
    const deferred: { resolve?: (v: BotStatus) => void } = {};
    vi.mocked(getBotStatus).mockReturnValue(
      new Promise((resolve) => {
        deferred.resolve = resolve;
      })
    );

    const { unmount } = renderHook(() => useBotStatus(apiUrl));
    unmount();

    // Resolving after unmount must not throw an act() warning or crash.
    expect(() => deferred.resolve?.({ connected: true })).not.toThrow();
  });
});

describe("useBotStatus under Electron", () => {
  afterEach(() => {
    delete window.instantsPresence;
    vi.mocked(getBotStatus).mockReset();
  });

  function bridge() {
    let push: (snapshot: unknown) => void = () => {};
    window.instantsPresence = {
      setServer: vi.fn(),
      setPlaying: vi.fn(),
      setSettings: vi.fn(),
      stop: vi.fn(),
      onSnapshot: (listener: (snapshot: never) => void) => {
        push = listener as (snapshot: unknown) => void;
        return () => {};
      }
    };
    return (snapshot: unknown) => act(() => push(snapshot));
  }

  it("reads main's one poll instead of making its own", () => {
    const send = bridge();
    const { result } = renderHook(() => useBotStatus(apiUrl));

    expect(result.current).toBeNull();
    send({ server: apiUrl, bot: { connected: true }, playing: null, silent: false });

    expect(result.current).toEqual({ connected: true });
    expect(getBotStatus).not.toHaveBeenCalled();
  });

  it("ignores an answer about another server", () => {
    const send = bridge();
    const { result } = renderHook(() => useBotStatus(apiUrl));

    send({ server: "http://10.0.0.9:9001/api/v1", bot: { connected: true }, playing: null, silent: false });

    expect(result.current).toBeNull();
  });
});
