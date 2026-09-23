import { useEffect, useState } from "react";
import { getBotStatus } from "./service";
import type { BotStatus } from "./service";

const POLL_MS = 8000;

/**
 * Polls GET /bot/status on an interval while `apiUrl` names an active
 * server. `null` means "unknown" — still loading, no active server, or the
 * request failed (unreachable server, or an old backend with no
 * /bot/status route, which 404s the same as any unknown path) — and must
 * never be treated the same as `{connected: false}`: gating on an unknown
 * state would lock out a server that might not even understand the
 * question yet. This mirrors the same conservative default the app already
 * applies to server discovery (see CLAUDE.md).
 */
export default function useBotStatus(apiUrl: string | null): BotStatus | null {
  const [status, setStatus] = useState<BotStatus | null>(null);
  // Under Electron the main process makes the one poll for every window and
  // broadcasts it; a plain browser tab has no bridge and polls for itself.
  const shared = typeof window.instantsPresence?.onSnapshot === "function";

  useEffect(() => {
    if (!shared) return undefined;

    return window.instantsPresence?.onSnapshot((snapshot) => {
      // A snapshot about another server says nothing about this one.
      setStatus(apiUrl !== null && snapshot.server === apiUrl ? snapshot.bot : null);
    });
  }, [shared, apiUrl]);

  useEffect(() => {
    if (shared) return undefined;

    if (!apiUrl) {
      setStatus(null);
      return undefined;
    }

    let cancelled = false;

    async function tick() {
      try {
        const next = await getBotStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl, shared]);

  // The snapshot may lag a server switch by one broadcast: until it has
  // caught up, the last server's answer must not stand.
  return status;
}
