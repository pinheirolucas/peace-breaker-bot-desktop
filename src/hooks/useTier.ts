import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

/** The window's width tier. The same three as src/styles/shell.css's
 *  container queries, and the same numbers — 880 and 600. */
export type Tier = "roomy" | "snug" | "tight";

export const SNUG_MAX = 879;
export const TIGHT_MAX = 599;

/** A width of 0 is an unmeasured element (jsdom, or not laid out yet), which
 *  reads as the roomiest tier: the safe default, and today's behaviour. */
export function tierForWidth(width: number): Tier {
  if (!width) return "roomy";
  if (width <= TIGHT_MAX) return "tight";
  if (width <= SNUG_MAX) return "snug";
  return "roomy";
}

/**
 * Measures the app root, for the few places CSS cannot answer: a menu is
 * portaled to <body>, outside the `app` container, so a container query
 * never reaches it. What can be CSS still is; this is only for content the
 * tier decides — the overflow menu offering the server in a Tight window.
 */
export function useTier(ref: RefObject<HTMLElement | null>): Tier {
  const [tier, setTier] = useState<Tier>("roomy");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const measure = (width: number) => setTier(tierForWidth(width));
    measure(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") measure(width);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return tier;
}
