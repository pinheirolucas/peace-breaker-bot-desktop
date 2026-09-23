import { useEffect, useRef } from "react";
import type { GlobalModifier, ShortcutResult } from "../../electron/shortcuts";
import { useGlobalShortcutsState } from "../storage";

export const noGlobalStatus: ShortcutResult = { registered: [], failed: [] };

export interface GlobalShortcutSettings {
  /** False without the Electron bridge. */
  available: boolean;
  enabled: boolean;
  /** Falls back to the OS default when the stored one isn't offered. */
  modifier: GlobalModifier | null;
  modifiers: GlobalModifier[];
  setEnabled: (enabled: boolean) => void;
  setModifier: (modifier: GlobalModifier) => void;
}

export function useGlobalShortcutSettings(): GlobalShortcutSettings {
  const [stored, setStored] = useGlobalShortcutsState({ enabled: false, modifier: null });
  const modifiers = window.instantsShortcuts?.modifiers ?? [];
  const available = modifiers.length > 0;
  const modifier =
    stored.modifier && modifiers.includes(stored.modifier) ? stored.modifier : (modifiers[0] ?? null);

  return {
    available,
    enabled: available && Boolean(stored.enabled),
    modifier,
    modifiers,
    setEnabled: (enabled) => setStored((current) => ({ ...current, enabled })),
    setModifier: (next) => setStored((current) => ({ ...current, modifier: next }))
  };
}

export interface UseGlobalShortcutsOptions {
  keys: string[];
  onFire: (key: string) => void;
  onStatus: (status: ShortcutResult) => void;
  /** Enabling or changing the modifier left some keys unregistered. */
  onSetupFailed: (count: number) => void;
}

/** Registers the favourites' keys with the main process, only when enabled, modifier or keys change. */
export function useGlobalShortcuts({ keys, onFire, onStatus, onSetupFailed }: UseGlobalShortcutsOptions) {
  const { available, enabled, modifier } = useGlobalShortcutSettings();
  const sortedKeys = [...new Set(keys)].sort();
  const signature = JSON.stringify([enabled, modifier, sortedKeys]);

  const latest = useRef({ onFire, onStatus, onSetupFailed });
  latest.current = { onFire, onStatus, onSetupFailed };

  useEffect(() => {
    const bridge = window.instantsShortcuts;
    if (!bridge || typeof bridge.onFired !== "function") {
      return undefined;
    }

    return bridge.onFired((key) => latest.current.onFire(key));
  }, []);

  // Only a switch or modifier change earns the failure toast, not editing a key.
  const previousSetup = useRef<string | null>(null);

  useEffect(() => {
    const bridge = window.instantsShortcuts;
    if (!available || !bridge || !modifier || typeof bridge.setGlobal !== "function") {
      return undefined;
    }

    const setup = JSON.stringify([enabled, modifier]);
    const setupChanged = previousSetup.current !== null && previousSetup.current !== setup;
    previousSetup.current = setup;

    let cancelled = false;

    Promise.resolve(bridge.setGlobal({ enabled, modifier, keys: enabled ? sortedKeys : [] }))
      .then((result) => {
        if (cancelled) return;

        const status = result ?? noGlobalStatus;
        latest.current.onStatus(enabled ? status : noGlobalStatus);
        if (enabled && setupChanged && status.failed.length > 0) {
          latest.current.onSetupFailed(status.failed.length);
        }
      })
      .catch(() => {
        if (!cancelled) latest.current.onStatus(noGlobalStatus);
      });

    return () => {
      cancelled = true;
    };
    // signature covers the inputs; sortedKeys is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, available]);
}
