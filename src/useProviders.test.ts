import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import useProviders from "./useProviders";
import { getProviders } from "./service";
import type { ProviderInfo } from "./service";

vi.mock("./service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service")>()),
  getProviders: vi.fn()
}));

const apiUrl = "http://10.0.0.42:9001/api/v1";

const providers: ProviderInfo[] = [
  { key: "myinstants", name: "MyInstants", supportsSearch: true, supportsRegion: true },
  { key: "soundbuttons", name: "Sound Buttons", supportsSearch: true, supportsRegion: false }
];

describe("useProviders", () => {
  beforeEach(() => {
    vi.mocked(getProviders).mockReset();
  });

  it("starts unknown (null) rather than assuming a single provider", () => {
    vi.mocked(getProviders).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProviders(apiUrl));

    expect(result.current).toBeNull();
  });

  it("resolves to the registry once the request answers", async () => {
    vi.mocked(getProviders).mockResolvedValue(providers);

    const { result } = renderHook(() => useProviders(apiUrl));

    await waitFor(() => expect(result.current).toEqual(providers));
  });

  // A failed request (unreachable server, or an old backend with no
  // /providers route) must resolve to "unknown", not an empty list — an
  // empty list would look like a registry with genuinely nothing in it.
  it("resolves to null when the request fails", async () => {
    vi.mocked(getProviders).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useProviders(apiUrl));

    await waitFor(() => expect(vi.mocked(getProviders)).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("stays null with no active server, and never calls the backend", () => {
    const { result } = renderHook(() => useProviders(null));

    expect(result.current).toBeNull();
    expect(getProviders).not.toHaveBeenCalled();
  });

  it("does not refetch on rerender with the same server", async () => {
    vi.mocked(getProviders).mockResolvedValue(providers);

    const { rerender } = renderHook(({ url }) => useProviders(url), {
      initialProps: { url: apiUrl as string | null }
    });
    await waitFor(() => expect(getProviders).toHaveBeenCalledTimes(1));

    rerender({ url: apiUrl });

    expect(getProviders).toHaveBeenCalledTimes(1);
  });

  it("resets to null when the server goes away", async () => {
    vi.mocked(getProviders).mockResolvedValue(providers);

    const { result, rerender } = renderHook(({ url }) => useProviders(url), {
      initialProps: { url: apiUrl as string | null }
    });

    await waitFor(() => expect(result.current).toEqual(providers));

    rerender({ url: null });

    expect(result.current).toBeNull();
  });

  it("does not update state after unmount", async () => {
    const deferred: { resolve?: (v: ProviderInfo[]) => void } = {};
    vi.mocked(getProviders).mockReturnValue(
      new Promise((resolve) => {
        deferred.resolve = resolve;
      })
    );

    const { unmount } = renderHook(() => useProviders(apiUrl));
    unmount();

    expect(() => deferred.resolve?.(providers)).not.toThrow();
  });
});
