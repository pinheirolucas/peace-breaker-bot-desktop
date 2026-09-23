// What the main process needs to know from the renderers, and how it is
// validated on the way in. Pure, and inlined into the sandboxed preload like
// chrome.ts. The renderer is untrusted.

/** renderer -> main: the address of the active server, or null for none. */
export const presenceServerChannel = "presence:server";

const maxUrl = 2048;

/**
 * The server address the renderer reports, normalized (no trailing slash), or
 * undefined when it is not one. null is a valid report: no active server.
 */
export function serverUrl(x: unknown): string | null | undefined {
  if (x === null) return null;
  if (typeof x !== "string" || x.length === 0 || x.length > maxUrl) return undefined;

  try {
    const url = new URL(x);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname === "") {
      return undefined;
    }
    return x.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
