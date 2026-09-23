import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { compactWidth } from "../../electron/settings";

/** Below 720 the settings sidebar is an icon rail. An unmeasured width (jsdom, or not laid out yet) is the roomy layout. */
export function compactForWidth(width: number): boolean {
  return width > 0 && width < compactWidth;
}

/** Measures the settings window: the sidebar's labels and where the search sits are decided in JS, since the search input moves. */
export function useCompact(ref: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    setCompact(compactForWidth(element.getBoundingClientRect().width));

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setCompact(compactForWidth(width));
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return compact;
}
