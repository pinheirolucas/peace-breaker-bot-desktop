import { useEffect, useRef, useState } from "react";
import { defaultPresenceSettings, effectiveSettings, isPresenceSettings } from "../../electron/presence";
import type { PlayingReport, PresenceSettings, PresenceSnapshot } from "../../electron/presence";
import { usePresenceSettingsState } from "../storage";

export interface PresenceSettingsApi {
  /** False without the Electron bridge (a browser tab): there is no tray to configure. */
  available: boolean;
  /** As stored, with anything missing or malformed filled in. */
  settings: PresenceSettings;
  /** What is actually in force: quick access and the title need the icon. */
  effective: PresenceSettings;
  setSettings: (settings: PresenceSettings) => void;
}

export function usePresenceSettings(): PresenceSettingsApi {
  const [stored, setStored] = usePresenceSettingsState(defaultPresenceSettings);
  const merged = { ...defaultPresenceSettings, ...stored };
  const settings = isPresenceSettings(merged) ? merged : defaultPresenceSettings;

  return {
    available: typeof window.instantsPresence?.setSettings === "function",
    settings,
    effective: effectiveSettings(settings),
    setSettings: setStored
  };
}

/** Tells main what the tray and quick access are set to, whenever it changes. */
export function useReportPresenceSettings(settings: PresenceSettings): void {
  const signature = JSON.stringify(settings);

  useEffect(() => {
    window.instantsPresence?.setSettings?.(settings);
    // The signature stands in for the object, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

/** Tells main what this window is playing, and that it stopped. */
export function useReportPlaying(report: PlayingReport | null): void {
  const signature = report ? `${report.mode}:${report.name}` : "";

  useEffect(() => {
    window.instantsPresence?.setPlaying?.(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // A window closing says nothing more; main forgets it on its own.
}

/** The one record from main, or null in a plain browser tab (which polls for itself). */
export function usePresenceSnapshot(): PresenceSnapshot | null {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot | null>(null);
  const bridge = useRef(window.instantsPresence);

  useEffect(() => bridge.current?.onSnapshot?.(setSnapshot), []);

  return snapshot;
}
