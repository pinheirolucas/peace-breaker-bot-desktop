import { useEffect, useRef } from "react";
import type { GlobalModifier, ShortcutResult } from "../../electron/shortcuts";
import { useGlobalShortcutsState } from "../storage";

export const noGlobalStatus: ShortcutResult = { registered: [], failed: [] };

export interface GlobalShortcutSettings {
  /** False without the Electron bridge (a browser tab, Storybook): the
   *  section is then not rendered at all, the way discovery degrades. */
  available: boolean;
  enabled: boolean;
  /** Resolved: a stored value this OS does not offer falls back to its default. */
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
  /** Every key a favourite has. */
  keys: string[];
  /** A combo fired while another app had focus. */
  onFire: (key: string) => void;
  /** Where the last request landed, for the sheet and the key dialog. */
  onStatus: (status: ShortcutResult) => void;
  /** Turning the switch on, or changing the modifier, left keys unregistered. */
  onSetupFailed: (count: number) => void;
}

/**
 * Registers the favourites' keys with the main process. Sends only when a
 * derived string changes (enabled, modifier and the sorted keys), never on
 * every render, and releases everything when turned off.
 */
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

  // A change of switch or modifier, as opposed to of keys, is what earns the
  // "N shortcuts won't work" toast: editing one key shouldn't nag.
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
    // The signature is the whole input; sortedKeys is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, available]);
}
