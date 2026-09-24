import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppearance } from "./useAppearance";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
});

describe("useAppearance", () => {
  it("opens the shell with begin, and only then is it editing", () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.editing).toBe(false);

    act(() => result.current.begin());

    expect(result.current.editing).toBe(true);
    expect(result.current.previewing).toBe(false);
  });

  it("previews without a shell: the palette's draft is not the Aparência stage", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => {
      result.current.beginPreview();
      result.current.preview({ theme: "brasa" });
    });

    expect(result.current.editing).toBe(false);
    expect(result.current.previewing).toBe(true);
    expect(result.current.theme).toBe("brasa");
    expect(document.documentElement.dataset.theme).toBe("brasa");
    // The saved values are what "atual" reads, not the draft.
    expect(result.current.saved.theme).toBe("esmalte");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("is one draft: a preview started over the shell does not replace it", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => {
      result.current.begin();
      result.current.beginPreview();
    });

    expect(result.current.editing).toBe(true);
  });

  it("drops the draft on cancel, saving nothing", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => {
      result.current.beginPreview();
      result.current.preview({ theme: "brasa", mode: "dark" });
    });
    act(() => result.current.cancel());

    expect(result.current.previewing).toBe(false);
    expect(result.current.theme).toBe("esmalte");
    expect(localStorage.getItem("theme")).toBeNull();
    expect(localStorage.getItem("colorMode")).toBeNull();
  });

  it("saves the draft on commit", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => {
      result.current.begin();
      result.current.preview({ theme: "frevo", mode: "dark" });
    });
    act(() => result.current.commit());

    expect(JSON.parse(localStorage.getItem("theme")!)).toBe("frevo");
    expect(JSON.parse(localStorage.getItem("colorMode")!)).toBe("dark");
    expect(result.current.editing).toBe(false);
  });

  it("commits a patch over the draft in the same event that previewed it, with no render between", () => {
    const { result } = renderHook(() => useAppearance());

    act(() => {
      result.current.beginPreview();
      result.current.preview({ theme: "brasa" });
      result.current.commit({ theme: "cerrado" });
    });

    expect(JSON.parse(localStorage.getItem("theme")!)).toBe("cerrado");
    expect(result.current.previewing).toBe(false);
  });

  it("commits a patch with no draft at all, keeping what was not named", () => {
    localStorage.setItem("theme", JSON.stringify("brasa"));
    const { result } = renderHook(() => useAppearance());

    act(() => result.current.commit({ mode: "dark" }));

    expect(JSON.parse(localStorage.getItem("colorMode")!)).toBe("dark");
    expect(JSON.parse(localStorage.getItem("theme")!)).toBe("brasa");
  });
});
