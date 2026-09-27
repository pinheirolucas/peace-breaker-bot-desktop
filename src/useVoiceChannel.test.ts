import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import useVoiceChannel, { useVoiceToasts } from "./useVoiceChannel";
import type { VoiceChannel } from "./useVoiceChannel";
import { ApiError, isHealthy, joinVoice, leaveVoice } from "./service";
import type { BotStatus } from "./service";

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  isHealthy: vi.fn(() => true),
  joinVoice: vi.fn(),
  leaveVoice: vi.fn()
}));

const apiUrl = "http://10.0.0.42:9001/api/v1";
const geral: BotStatus = { connected: true, guildName: "Casa", channelId: "234567890123456789", channelName: "geral" };
const remembered = { channelId: "234567890123456789", guildName: "Casa", channelName: "geral" };

describe("useVoiceChannel in a browser tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isHealthy).mockReturnValue(true);
  });

  afterEach(() => {
    vi.mocked(joinVoice).mockReset();
    vi.mocked(leaveVoice).mockReset();
  });

  it("remembers the channel a status names, and offers to leave it", () => {
    const { result } = renderHook(() => useVoiceChannel(apiUrl, geral));

    expect(result.current.lastChannel).toEqual(remembered);
    expect(result.current.action).toEqual({ kind: "leave", channelName: "geral" });
    expect(JSON.parse(localStorage.getItem("lastVoiceChannel")!)).toEqual(remembered);
  });

  it("leaves, and hands the status the bot answers with to the caller", async () => {
    const onStatus = vi.fn();
    vi.mocked(leaveVoice).mockResolvedValue({ connected: false });
    const { result } = renderHook(() => useVoiceChannel(apiUrl, geral, { onStatus }));

    let outcome;
    await act(async () => {
      outcome = await result.current.leave();
    });

    expect(outcome).toEqual({ ok: true });
    expect(onStatus).toHaveBeenCalledWith({ connected: false });
  });

  it("rejoins the remembered channel by its ID", async () => {
    localStorage.setItem("lastVoiceChannel", JSON.stringify(remembered));
    vi.mocked(joinVoice).mockResolvedValue(geral);
    const { result } = renderHook(() => useVoiceChannel(apiUrl, { connected: false }));

    expect(result.current.action).toEqual({ kind: "rejoin", channelName: "geral", guildName: "Casa" });
    await act(async () => {
      await result.current.rejoin();
    });

    expect(joinVoice).toHaveBeenCalledWith(remembered.channelId);
  });

  it("forgets a channel that is gone, and keeps one that only refused", async () => {
    localStorage.setItem("lastVoiceChannel", JSON.stringify(remembered));
    vi.mocked(joinVoice).mockRejectedValueOnce(new ApiError("voice_join_failed", "full"));
    const { result } = renderHook(() => useVoiceChannel(apiUrl, { connected: false }));

    let outcome;
    await act(async () => {
      outcome = await result.current.rejoin();
    });
    expect(outcome).toEqual({ ok: false, offline: false, label: "voice_join_failed" });
    expect(result.current.lastChannel).toEqual(remembered);

    vi.mocked(joinVoice).mockRejectedValueOnce(new ApiError("channel_not_found", "gone"));
    await act(async () => {
      await result.current.rejoin();
    });
    expect(result.current.lastChannel).toBeNull();
    expect(result.current.action).toEqual({ kind: "none" });
  });

  it("reports no answer at all as offline", async () => {
    vi.mocked(leaveVoice).mockImplementation(async () => {
      vi.mocked(isHealthy).mockReturnValue(false);
      throw new ApiError(null, "no answer");
    });
    const { result } = renderHook(() => useVoiceChannel(apiUrl, null));

    let outcome;
    await act(async () => {
      outcome = await result.current.leave();
    });

    expect(outcome).toEqual({ ok: false, offline: true });
  });
});

describe("useVoiceChannel under Electron", () => {
  let push: (snapshot: unknown) => void = () => {};

  beforeEach(() => {
    localStorage.clear();
    window.instantsPresence = {
      setServer: vi.fn(),
      setPlaying: vi.fn(),
      setSettings: vi.fn(),
      stop: vi.fn(),
      leave: vi.fn(async () => ({ ok: true as const })),
      rejoin: vi.fn(async () => ({ ok: true as const })),
      seedLastChannel: vi.fn(),
      onSnapshot: (listener) => {
        push = listener as (snapshot: unknown) => void;
        return () => {};
      }
    };
  });

  afterEach(() => {
    delete window.instantsPresence;
  });

  const snapshot = (lastChannel: unknown) => ({ server: apiUrl, bot: null, playing: null, silent: false, lastChannel });

  it("hands the stored channel to main once, from the window that owns it", () => {
    localStorage.setItem("lastVoiceChannel", JSON.stringify(remembered));
    renderHook(() => useVoiceChannel(apiUrl, null, { owner: true }));

    expect(window.instantsPresence!.seedLastChannel).toHaveBeenCalledWith(remembered);
  });

  it("stores what main remembers, and clears it only once main lets one go", () => {
    localStorage.setItem("lastVoiceChannel", JSON.stringify(remembered));
    renderHook(() => useVoiceChannel(apiUrl, null, { owner: true }));

    // Main not seeded yet: nothing to clear.
    act(() => push(snapshot(null)));
    expect(JSON.parse(localStorage.getItem("lastVoiceChannel")!)).toEqual(remembered);

    act(() => push(snapshot({ channelId: "999", channelName: "jogos" })));
    expect(JSON.parse(localStorage.getItem("lastVoiceChannel")!)).toEqual({ channelId: "999", channelName: "jogos" });

    act(() => push(snapshot(null)));
    expect(JSON.parse(localStorage.getItem("lastVoiceChannel")!)).toBeNull();
  });

  it("leaves storage alone in a window that does not own it", () => {
    renderHook(() => useVoiceChannel(apiUrl, null));
    act(() => push(snapshot(remembered)));

    expect(window.instantsPresence!.seedLastChannel).not.toHaveBeenCalled();
    expect(localStorage.getItem("lastVoiceChannel")).toBeNull();
  });

  it("asks main to leave and rejoin", async () => {
    const { result } = renderHook(() => useVoiceChannel(apiUrl, null));

    await act(async () => {
      await result.current.leave();
      await result.current.rejoin();
    });

    expect(window.instantsPresence!.leave).toHaveBeenCalledTimes(1);
    expect(window.instantsPresence!.rejoin).toHaveBeenCalledTimes(1);
  });
});

describe("useVoiceToasts", () => {
  const voice = (patch: Partial<VoiceChannel> = {}): VoiceChannel => ({
    lastChannel: remembered,
    action: { kind: "leave", channelName: "geral" },
    leave: vi.fn(async () => ({ ok: true as const })),
    rejoin: vi.fn(async () => ({ ok: true as const })),
    ...patch
  });

  it("says the bot left, and offers Desfazer, which calls it back", async () => {
    const show = vi.fn();
    const current = voice();
    const { result } = renderHook(() => useVoiceToasts(current, show, "10.0.0.42:9001"));

    await act(async () => result.current.leave());
    await vi.waitFor(() => expect(show).toHaveBeenCalled());

    const toast = show.mock.lastCall![0];
    expect(toast.message).toBe("O bot saiu de #geral. Paz restaurada.");
    expect(toast.actionLabel).toBe("Desfazer");

    await act(async () => toast.onAction());
    await vi.waitFor(() => expect(show).toHaveBeenLastCalledWith({ message: "O bot voltou para #geral." }));
    expect(current.rejoin).toHaveBeenCalledTimes(1);
  });

  it("offers no Desfazer with nothing remembered", async () => {
    const show = vi.fn();
    const { result } = renderHook(() => useVoiceToasts(voice({ lastChannel: null, action: { kind: "leave" } }), show, null));

    await act(async () => result.current.leave());
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith({ message: "O bot saiu do canal. Paz restaurada." }));
  });

  it("translates a refusal by its label, and no answer as the connection error", async () => {
    const show = vi.fn();
    const { result, rerender } = renderHook(({ v }) => useVoiceToasts(v, show, "10.0.0.42:9001"), {
      initialProps: { v: voice({ rejoin: vi.fn(async () => ({ ok: false as const, offline: false as const, label: "voice_join_failed" })) }) }
    });

    await act(async () => result.current.rejoin());
    await vi.waitFor(() =>
      expect(show).toHaveBeenLastCalledWith({ message: "O bot não conseguiu se conectar a esse canal de voz" })
    );
    expect(show).toHaveBeenCalledWith({ message: "Chamando o bot para #geral…", duration: 20000 });

    rerender({ v: voice({ leave: vi.fn(async () => ({ ok: false as const, offline: true as const })) }) });
    await act(async () => result.current.leave());
    await vi.waitFor(() =>
      expect(show).toHaveBeenLastCalledWith({ message: "Não foi possível conectar a 10.0.0.42:9001" })
    );
  });

  it("turns a play refused for want of a channel into an offer to call the bot back", () => {
    const { result } = renderHook(() => useVoiceToasts(voice(), vi.fn(), null));

    expect(result.current.botAway(new ApiError("bot_not_connected", "x"))).toMatchObject({
      message: "O bot não está em um canal de voz.",
      actionLabel: "Chamar para #geral"
    });
    expect(result.current.botAway(new ApiError("invalid_url", "x"))).toBeNull();
  });

  it("leaves a refused play alone when nothing is remembered", () => {
    const { result } = renderHook(() => useVoiceToasts(voice({ lastChannel: null }), vi.fn(), null));

    expect(result.current.botAway(new ApiError("bot_not_connected", "x"))).toBeNull();
  });
});
