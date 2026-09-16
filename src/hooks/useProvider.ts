import { useProviderState } from "../storage";
import type { ProviderInfo } from "../service";

export const DEFAULT_PROVIDER_KEY = "myinstants";
export const DEFAULT_PROVIDER_NAME = "MyInstants";

/**
 * The active provider, persisted. Resolving it needs the fetched registry
 * (unlike useRegion's static list), so `providers` — from useProviders —
 * comes in as an argument rather than being read here. A stored key the
 * registry doesn't contain — a removed provider, a build from before a
 * newer one existed — resolves to the default rather than reaching the
 * backend with a key the UI never actually offered; `providers` itself
 * being unknown resolves to no provider at all, matching the exact request
 * MyInstantsPanel already sent before the registry could answer.
 */
export function useProvider(providers: ProviderInfo[] | null) {
  const [key, setKey] = useProviderState(DEFAULT_PROVIDER_KEY);
  const provider =
    providers?.find((candidate) => candidate.key === key) ??
    providers?.find((candidate) => candidate.key === DEFAULT_PROVIDER_KEY) ??
    null;

  return { provider, setProvider: setKey };
}
