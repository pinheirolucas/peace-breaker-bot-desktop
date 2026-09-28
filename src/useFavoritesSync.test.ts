import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { FavoritesSync } from "./lib/favoritesSync";
import { ApiError, getFavorites, putFavorites } from "./service";
import type { Favorites } from "./service";
import type { Instant } from "./storage";
import { useFavoritesSync } from "./useFavoritesSync";

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getFavorites: vi.fn(),
  putFavorites: vi.fn()
}));

const home = "http://10.0.0.2:9001/api/v1";
const studio = "http://10.0.0.7:9001/api/v1";
const clip = (id: string, key?: string): Instant =>
  key === undefined ? { name: id.toUpperCase(), url: `https://x.test/${id}.mp3` } : { name: id.toUpperCase(), url: `https://x.test/${id}.mp3`, key };
const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => clip(id));

let bot: Favorites;

function serve(owner: string, revision: number, instants: Instant[]) {
  bot = { owner, revision, instants };
}

function stored<T>(key: string): T {
  return JSON.parse(window.localStorage.getItem(key) ?? "null") as T;
}

function store(instants: Instant[], sync?: FavoritesSync) {
  window.localStorage.setItem("instants", JSON.stringify(instants));
  if (sync) window.localStorage.setItem("favoritesSync", JSON.stringify(sync));
}

const agreed = (entries: Record<string, { revision: number; base: Instant[] }>, owner = "lucas", list: Instant[] = []): FavoritesSync => ({
  currentOwner: owner,
  owners: { [owner]: { list, servers: entries } }
});

beforeEach(() => {
  window.localStorage.clear();
  serve("lucas", 0, []);
  vi.mocked(getFavorites).mockReset().mockImplementation(async () => structuredClone(bot));
  vi.mocked(putFavorites)
    .mockReset()
    .mockImplementation(async (owner, baseRevision, instants) => {
      if (owner !== bot.owner) throw new ApiError("owner_mismatch", "not yours", 409);
      if (baseRevision !== bot.revision) throw new ApiError("favorites_conflict", "changed", 409);
      serve(owner, baseRevision + 1, instants);
      return structuredClone(bot);
    });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFavoritesSync", () => {
  it("does nothing without a server", async () => {
    renderHook(() => useFavoritesSync(null, true));
    await act(async () => {});
    expect(getFavorites).not.toHaveBeenCalled();
  });

  it("makes today's list the first owner's and pushes it to an empty bot", async () => {
    store([a, b]);
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(putFavorites).toHaveBeenCalledWith("lucas", 0, [a, b]));
    await waitFor(() =>
      expect(stored<FavoritesSync>("favoritesSync")).toMatchObject({
        currentOwner: "lucas",
        owners: { lucas: { servers: { [home]: { revision: 1, base: [a, b] } } } },
        status: { apiUrl: home, state: "synced" }
      })
    );
  });

  it("takes the bot's list when there is none here", async () => {
    serve("lucas", 4, [a, b]);
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(stored("instants")).toEqual([a, b]));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(putFavorites).not.toHaveBeenCalled();
  });

  it("merges both lists the first time, says so, and pushes the result", async () => {
    serve("lucas", 4, [a, b]);
    store([c, a]);
    const onMerged = vi.fn();
    renderHook(() => useFavoritesSync(home, true, onMerged));

    await waitFor(() => expect(putFavorites).toHaveBeenCalledWith("lucas", 4, [a, b, c]));
    expect(stored("instants")).toEqual([a, b, c]);
    expect(onMerged).toHaveBeenCalledWith(home);
  });

  it("takes a newer list from the bot when nothing changed here", async () => {
    serve("lucas", 6, [b, c]);
    store([a, b], agreed({ [home]: { revision: 5, base: [a, b] } }));
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(stored("instants")).toEqual([b, c]));
    expect(stored<FavoritesSync>("favoritesSync").owners.lucas.servers[home].revision).toBe(6);
  });

  it("pushes a change made here once it settles", async () => {
    serve("lucas", 5, [a]);
    store([a], agreed({ [home]: { revision: 5, base: [a] } }));
    renderHook(() => useFavoritesSync(home, true));
    await waitFor(() => expect(stored<FavoritesSync>("favoritesSync").status?.state).toBe("synced"));

    act(() => {
      window.localStorage.setItem("instants", JSON.stringify([a, b]));
      window.dispatchEvent(new StorageEvent("storage", { key: "instants", newValue: JSON.stringify([a, b]), storageArea: window.localStorage }));
    });

    await waitFor(() => expect(putFavorites).toHaveBeenCalledWith("lucas", 5, [a, b]));
    expect(bot.revision).toBe(6);
  });

  it("merges and retries when someone else wrote first", async () => {
    // Here: added c. On the bot, since revision 5: added d.
    serve("lucas", 6, [a, b, d]);
    store([a, b, c], agreed({ [home]: { revision: 5, base: [a, b] } }));
    vi.mocked(getFavorites).mockResolvedValueOnce({ owner: "lucas", revision: 5, instants: [a, b] });
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(bot.revision).toBe(7));
    expect(putFavorites).toHaveBeenNthCalledWith(1, "lucas", 5, [a, b, c]);
    expect(putFavorites).toHaveBeenNthCalledWith(2, "lucas", 6, [a, b, c, d]);
    expect(stored("instants")).toEqual([a, b, c, d]);
  });

  it("gives up after three conflicts", async () => {
    store([a, b], agreed({ [home]: { revision: 5, base: [a] } }));
    serve("lucas", 5, [a]);
    vi.mocked(putFavorites).mockRejectedValue(new ApiError("favorites_conflict", "changed", 409));
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(putFavorites).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(putFavorites).toHaveBeenCalledTimes(3);
  });

  it("carries changes made on one bot to another of the same owner without undoing them", async () => {
    // The studio bot last agreed on [a, b]. Since then, on the home bot, b went and c came.
    serve("lucas", 2, [a, b, d]);
    store([a, c], agreed({ [home]: { revision: 9, base: [a, c] }, [studio]: { revision: 1, base: [a, b] } }));
    renderHook(() => useFavoritesSync(studio, true));

    await waitFor(() => expect(putFavorites).toHaveBeenCalledWith("lucas", 2, [a, c, d]));
    expect(stored("instants")).toEqual([a, c, d]);
  });

  it("switches to another owner's list and never pushes one owner's list to another", async () => {
    serve("maria", 3, [d]);
    store([a, b], agreed({ [home]: { revision: 1, base: [a, b] } }));
    renderHook(() => useFavoritesSync(studio, true));

    await waitFor(() => expect(stored("instants")).toEqual([d]));
    const sync = stored<FavoritesSync>("favoritesSync");
    expect(sync.currentOwner).toBe("maria");
    expect(sync.owners.lucas.list).toEqual([a, b]);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(putFavorites).not.toHaveBeenCalled();
  });

  it("pulls again on owner_mismatch, which switches owners", async () => {
    store([a, b], agreed({ [home]: { revision: 1, base: [a] } }));
    vi.mocked(getFavorites).mockResolvedValueOnce({ owner: "lucas", revision: 1, instants: [a] });
    serve("maria", 0, []);
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(stored<FavoritesSync>("favoritesSync").currentOwner).toBe("maria"));
    expect(stored("instants")).toEqual([]);
    expect(putFavorites).toHaveBeenCalledTimes(1);
  });

  it("turns sync off for an old bot", async () => {
    store([a]);
    vi.mocked(getFavorites).mockRejectedValue(new ApiError(null, "no", 404));
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(stored<FavoritesSync>("favoritesSync").status).toEqual({ apiUrl: home, state: "unsupported" }));
    expect(stored("instants")).toEqual([a]);
    expect(putFavorites).not.toHaveBeenCalled();
  });

  it("stops pushing a list the bot refused, and leaves it alone", async () => {
    serve("lucas", 1, [a]);
    store([a, b], agreed({ [home]: { revision: 1, base: [a] } }));
    vi.mocked(putFavorites).mockRejectedValue(new ApiError("invalid_favorites", "bad", 400));
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() =>
      expect(stored<FavoritesSync>("favoritesSync").status).toEqual({ apiUrl: home, state: "stopped", label: "invalid_favorites", message: "bad" })
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(putFavorites).toHaveBeenCalledTimes(1);
    expect(stored("instants")).toEqual([a, b]);
  });

  it("keeps changes here while the bot is offline", async () => {
    store([a, b], agreed({ [home]: { revision: 1, base: [a] } }));
    vi.mocked(getFavorites).mockRejectedValue(new ApiError(null, "down"));
    renderHook(() => useFavoritesSync(home, true));

    await waitFor(() => expect(stored<FavoritesSync>("favoritesSync").status).toEqual({ apiUrl: home, state: "offline" }));
    expect(stored("instants")).toEqual([a, b]);
  });

  it("pulls again on focus and on the interval", async () => {
    const intervals = vi.spyOn(window, "setInterval");
    serve("lucas", 1, [a]);
    store([a], agreed({ [home]: { revision: 1, base: [a] } }));
    renderHook(() => useFavoritesSync(home, true));
    await waitFor(() => expect(getFavorites).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(getFavorites).toHaveBeenCalledTimes(2));

    const [tick] = intervals.mock.calls.find(([, ms]) => ms === 15000)!;
    act(() => (tick as () => void)());
    await waitFor(() => expect(getFavorites).toHaveBeenCalledTimes(3));
  });

  it("pulls again when the server comes back", async () => {
    serve("lucas", 1, [a]);
    store([a], agreed({ [home]: { revision: 1, base: [a] } }));
    const { rerender } = renderHook(({ healthy }) => useFavoritesSync(home, healthy), { initialProps: { healthy: true } });
    await waitFor(() => expect(getFavorites).toHaveBeenCalledTimes(1));

    rerender({ healthy: false });
    await act(async () => {});
    expect(getFavorites).toHaveBeenCalledTimes(1);

    rerender({ healthy: true });
    await waitFor(() => expect(getFavorites).toHaveBeenCalledTimes(2));
  });
});
