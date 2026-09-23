import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { dragThreshold } from "../../electron/clip";
import type { ClipRequest } from "../../electron/clip";
import SnackbarContext from "../SnackbarContext";

/**
 * What a card looks like while it is a drag source. "dragging" is the source
 * left behind while the OS carries the file; "unavailable" is a drag that
 * could not start, shown briefly next to its toast.
 */
export type ClipDragState = "rest" | "pressed" | "preparing" | "dragging" | "unavailable";

/** The bridge, or null in a plain browser tab, where there is no file to hand over. */
export function clipBridge(): NonNullable<Window["instantsClip"]> | null {
  const bridge = window.instantsClip;
  return bridge && typeof bridge.drag === "function" ? bridge : null;
}

const unavailableMs = 1600;
// A native drag reports nothing back, so this only bounds a state that would
// otherwise stay if the OS never gave the pointer back.
const draggingCeilingMs = 30_000;

/**
 * Makes a card a drag source for its clip's file. The file is prepared on
 * pointer down so it is usually ready before the pointer has travelled
 * `dragThreshold`; a press that travels less is a click and nothing here
 * runs. One that travels more is not, so its click is suppressed.
 */
export function useClipDrag(request: ClipRequest, enabled: boolean) {
  const { t } = useTranslation();
  const { openSnackbar } = useContext(SnackbarContext);
  const [state, setState] = useState<ClipDragState>("rest");
  const suppressClick = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ request, openSnackbar, message: t("card.dragFailed") });
  latest.current = { request, openSnackbar, message: t("card.dragFailed") };

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(
    () => () => {
      cleanup.current?.();
      clearTimer();
    },
    [clearTimer]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const bridge = clipBridge();

      if (
        !enabled ||
        !bridge ||
        event.button !== 0 ||
        event.pointerType === "touch" ||
        (event.target as HTMLElement).closest(".pfoot")
      ) {
        return;
      }

      cleanup.current?.();
      clearTimer();
      suppressClick.current = false;

      const clip = latest.current.request;
      const drag = bridge.drag;
      const dragEnd = bridge.dragEnd;
      const originX = event.clientX;
      const originY = event.clientY;
      let settled = false;

      void bridge
        .prepare(clip)
        .catch(() => "failed" as const)
        .then(() => {
          settled = true;
        });

      const stop = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        cleanup.current = null;
      };

      function onUp() {
        stop();
        setState("rest");
      }

      function onMove(move: globalThis.PointerEvent) {
        if (Math.hypot(move.clientX - originX, move.clientY - originY) < dragThreshold) return;

        stop();
        suppressClick.current = true;
        setState(settled ? "dragging" : "preparing");

        void drag(clip)
          .catch(() => "failed" as const)
          .then((result) => {
            if (result === "failed") {
              setState("unavailable");
              latest.current.openSnackbar({ message: latest.current.message });
              timer.current = setTimeout(() => setState("rest"), unavailableMs);
              return;
            }

            setState("dragging");

            // The OS drag reports no end. The first pointer event after it is the pointer coming back.
            const done = () => {
              window.removeEventListener("pointermove", done);
              window.removeEventListener("pointerdown", done);
              clearTimer();
              cleanup.current = null;
              setState("rest");
              dragEnd?.();
            };
            window.addEventListener("pointermove", done);
            window.addEventListener("pointerdown", done);
            cleanup.current = () => {
              window.removeEventListener("pointermove", done);
              window.removeEventListener("pointerdown", done);
            };
            timer.current = setTimeout(done, draggingCeilingMs);
          });
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      cleanup.current = stop;
      setState("pressed");
    },
    [enabled, clearTimer]
  );

  // A press that became a drag must not also play the clip.
  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return { state, bind: { onPointerDown, onClickCapture } };
}
