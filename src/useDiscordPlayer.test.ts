import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import useDiscordPlayer from "./useDiscordPlayer";
import { ApiError, playOnDiscord, stopPlayingOnDiscord } from "./service";

// service.ts is the network boundary; it gets its own MSW-backed tests. Here it
// is mocked so the hook's state machine can be driven directly, including the
// case that matters most: POST /bot/play does not resolve until the backend
// finishes or is stopped, so the "already playing" window is arbitrarily long.
vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  playOnDiscord: vi.fn(),
  stopPlayingOnDiscord: vi.fn()
}));

const A = "https://www.myinstants.com/a/";
const B = "https://www.myinstants.com/b/";

// A promise the test resolves by hand, standing in for a clip that is still
// playing on the server.
function deferred<T = string>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("useDiscordPlayer", () => {
  beforeEach(() => {
    vi.mocked(playOnDiscord).mockReset();
    vi.mocked(stopPlayingOnDiscord).mockReset();
    vi.mocked(stopPlayingOnDiscord).mockResolvedValue({} as Response);
  });

  it("starts idle", () => {
    const { result } = renderHook(() => useDiscordPlayer());

    expect(result.current[0]).toBe("");
    expect(result.current[1]).toBe(false);
  });

  it("marks the url as playing for as long as the backend call is outstanding", async () => {
    const inFlight = deferred();
    vi.mocked(playOnDiscord).mockReturnValue(inFlight.promise);

    const { result } = renderHook(() => useDiscordPlayer());

    let playCall: Promise<Error | undefined> | undefined;
    act(() => {
      playCall = result.current[2](A);
    });

    expect(playOnDiscord).toHaveBeenCalledWith(A);
    expect(result.current[0]).toBe(A);
    expect(result.current[1]).toBe(true);

    await act(async () => {
      inFlight.resolve("end");
      await playCall;
    });

    expect(result.current[0]).toBe("");
    expect(result.current[1]).toBe(false);
  });

  it('clears the url on exitReason "end"', async () => {
    vi.mocked(playOnDiscord).mockResolvedValue("end");

    const { result } = renderHook(() => useDiscordPlayer());

    let message;
    await act(async () => {
      message = await result.current[2](A);
    });

    expect(message).toBeUndefined();
    expect(result.current[0]).toBe("");
    expect(result.current[1]).toBe(false);
  });

  it('keeps the url on exitReason "stop" and reports no error', async () => {
    // "stop" means someone else stopped the clip mid-flight. The hook keeps its
    // url, so the card stays in the "this one is active" state.
    vi.mocked(playOnDiscord).mockResolvedValue("stop");

    const { result } = renderHook(() => useDiscordPlayer());

    let message;
    await act(async () => {
      message = await result.current[2](A);
    });

    expect(message).toBeUndefined();
    expect(result.current[0]).toBe(A);
    expect(result.current[1]).toBe(true);
  });

  it("stop() clears the url and tells the backend to stop", async () => {
    vi.mocked(playOnDiscord).mockResolvedValue("stop");

    const { result } = renderHook(() => useDiscordPlayer());

    await act(async () => {
      await result.current[2](A);
    });
    await act(async () => {
      await result.current[3]();
    });

    expect(stopPlayingOnDiscord).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe("");
    expect(result.current[1]).toBe(false);
  });

  it("play() while already playing stops the first clip before starting the second", async () => {
    const first = deferred();
    vi.mocked(playOnDiscord).mockReturnValueOnce(first.promise);
    vi.mocked(playOnDiscord).mockResolvedValue("end");

    const { result } = renderHook(() => useDiscordPlayer());

    act(() => {
      result.current[2](A);
    });
    expect(result.current[1]).toBe(true);

    await act(async () => {
      await result.current[2](B);
    });

    // One stop, and it landed between the two plays.
    expect(stopPlayingOnDiscord).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playOnDiscord).mock.calls).toEqual([[A], [B]]);
    expect(vi.mocked(stopPlayingOnDiscord).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(playOnDiscord).mock.invocationCallOrder[0]
    );
    expect(vi.mocked(stopPlayingOnDiscord).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(playOnDiscord).mock.invocationCallOrder[1]
    );

    // The second clip ran to completion, so nothing is playing.
    expect(result.current[0]).toBe("");
    expect(result.current[1]).toBe(false);

    // Resolving the abandoned first call must not resurrect its url.
    await act(async () => {
      first.resolve("stop");
      await first.promise;
    });
    expect(result.current[0]).toBe("");
  });

  it("does not stop anything when nothing is playing", async () => {
    vi.mocked(playOnDiscord).mockResolvedValue("end");

    const { result } = renderHook(() => useDiscordPlayer());

    await act(async () => {
      await result.current[2](A);
    });

    expect(stopPlayingOnDiscord).not.toHaveBeenCalled();
  });

  it("returns the error itself when the backend call rejects, for the caller to translate", async () => {
    const error = new ApiError("instant_not_found", "Não encontramos esse instant");
    vi.mocked(playOnDiscord).mockRejectedValue(error);

    const { result } = renderHook(() => useDiscordPlayer());

    let message;
    await act(async () => {
      message = await result.current[2](A);
    });

    expect(message).toBe(error);
  });

  // Pre-existing bug, asserted as current behaviour rather than fixed: play()
  // sets the url before awaiting, and the catch branch returns the message
  // without clearing it. The hook is then wedged "playing" a clip that never
  // started — the panels disable that card's local-play button and enable its
  // stop button until the user manually stops it.
  it("stays stuck in the playing state after a failure", async () => {
    vi.mocked(playOnDiscord).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useDiscordPlayer());

    await act(async () => {
      await result.current[2](A);
    });

    expect(result.current[0]).toBe(A);
    expect(result.current[1]).toBe(true);
  });
});
