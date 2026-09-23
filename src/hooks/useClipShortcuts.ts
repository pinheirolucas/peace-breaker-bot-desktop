import { useEffect, useRef } from "react";
import { clipKeyFromEvent, isEditableTarget, overlayOpen } from "../lib/clipKeys";

export type ClipMode = "discord" | "local";

export interface ClipShortcutHandlers {
  /** A favourite's key was pressed. Bare plays on Discord, Shift plays here. */
  trigger: (key: string, mode: ClipMode) => void;
  /** Esc. Returns whether it stopped anything, so Esc keeps its other
   *  meanings (close a menu, leave Organizar) when nothing is playing. */
  stop: () => boolean;
}

/**
 * The window's own keys. Every rule is one guard: never in a text field,
 * behind a dialog or menu (Aparência included — its dock is a dialog), in
 * Organizar, or with Cmd, Ctrl or Alt held. Clip keys are bare because the
 * point is speed mid-call, which is safe only because of these guards.
 */
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
