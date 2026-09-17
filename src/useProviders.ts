import { useEffect, useState } from "react";
import { getProviders } from "./service";
import type { ProviderInfo } from "./service";

/**
 * The provider registry, fetched once per active server — unlike
 * useBotStatus this never changes mid-session, so there is nothing to poll.
 * `null` means "unknown": still loading, no active server, or an old
 * backend with no /providers route, which 404s the same as any unknown
 * path — and must never be treated as "there is exactly one provider":
 * the picker just stays absent, the same conservative default useBotStatus
 * already applies to a status it can't yet answer.
 */
export default function useProviders(apiUrl: string | null): ProviderInfo[] | null {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);

  useEffect(() => {
    if (!apiUrl) {
      setProviders(null);
      return undefined;
    }

    let cancelled = false;

    getProviders()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {
        if (!cancelled) setProviders(null);
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return providers;
}
