import { useEffect, useRef } from "react";
import { panelShortcutKey } from "../../electron/panel";
import type { GlobalModifier } from "../../electron/shortcuts";
import { usePanelShortcutState } from "../storage";

export interface PanelShortcutSettings {
  /** False without the Electron bridge. */
  available: boolean;
  enabled: boolean;
  /** Falls back to the OS default when the stored one is not offered. */
  modifier: GlobalModifier | null;
  modifiers: GlobalModifier[];
  key: string;
  set: (next: { enabled: boolean; modifier: GlobalModifier | null }) => void;
}

export function usePanelShortcutSettings(): PanelShortcutSettings {
  const [stored, setStored] = usePanelShortcutState({ enabled: false, modifier: null });
  const modifiers = window.instantsShortcuts?.modifiers ?? [];
  const available = modifiers.length > 0 && typeof window.instantsPanel?.setShortcut === "function";
  const modifier =
    stored.modifier && modifiers.includes(stored.modifier) ? stored.modifier : (modifiers[0] ?? null);

  return {
    available,
    enabled: available && Boolean(stored.enabled),
    modifier,
    modifiers,
    key: panelShortcutKey,
    set: setStored
  };
}

/**
 * Registers the panel's shortcut with the main process, only while its switch
 * is on and the panel is; releases it the moment either goes off. When another
 * app holds the combination the switch snaps back off and `onTaken` says so.
 */
export function usePanelShortcut(panelOn: boolean, onTaken: () => void): void {
  const { available, enabled, modifier, set } = usePanelShortcutSettings();
  const latest = useRef({ onTaken, set });
  latest.current = { onTaken, set };
  const wanted = enabled && panelOn;

  useEffect(() => {
    const bridge = window.instantsPanel;
    if (!available || !bridge || !modifier) return undefined;

    let cancelled = false;

    Promise.resolve(bridge.setShortcut({ enabled: wanted, modifier }))
      .then((result) => {
        if (cancelled || !wanted || !result || result.failed.length === 0) return;

        latest.current.set({ enabled: false, modifier });
        latest.current.onTaken();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [available, wanted, modifier]);
}
