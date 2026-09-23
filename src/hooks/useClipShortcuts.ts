import { useEffect, useRef } from "react";
import { clipKeyFromEvent, isEditableTarget, overlayOpen } from "../lib/clipKeys";

export type ClipMode = "discord" | "local";

export interface ClipShortcutHandlers {
  trigger: (key: string, mode: ClipMode) => void;
  /** Esc. Returns whether it stopped anything. */
  stop: () => boolean;
}

/** Window keydown for clip keys: bare plays on Discord, Shift plays here, Esc stops. Ignored in text fields, behind overlays, and with Cmd/Ctrl/Alt held. */
export function useClipShortcuts(enabled: boolean, handlers: ClipShortcutHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target) || overlayOpen()) return;

      if (event.key === "Escape") {
        if (latest.current.stop()) {
          event.preventDefault();
        }
        return;
      }

      const key = clipKeyFromEvent(event);
      if (key) {
        event.preventDefault();
        latest.current.trigger(key, event.shiftKey ? "local" : "discord");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
