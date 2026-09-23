import { useCallback, useEffect, useRef, useState } from "react";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "upToDate" }
  | { state: "available"; version: string }
  | { state: "failed" };

/** A check that has heard nothing back by now is not coming back. */
const CHECK_TIMEOUT_MS = 20_000;

/**
 * Configurações › Geral's "Verificar agora". Main answers a manual check to
 * whoever asked, so this window hears exactly the events its own click caused.
 * Outside Electron there is nothing to check with: `available` is false and
 * the button stays off.
 */
export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const available = typeof window.instantsUpdates?.checkNow === "function";

  useEffect(() => {
    const updates = window.instantsUpdates;
    if (!updates || typeof updates.onNotAvailable !== "function") return undefined;

    const settle = (next: UpdateStatus) => () => {
      clearTimeout(timer.current);
      setStatus(next);
    };

    const unsubscribers = [
      updates.onNotAvailable(settle({ state: "upToDate" })),
      updates.onCheckFailed(settle({ state: "failed" })),
      updates.onAvailable((version) => {
        clearTimeout(timer.current);
        setStatus({ state: "available", version });
      })
    ];

    return () => {
      clearTimeout(timer.current);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const check = useCallback(() => {
    if (!available) return;

    setStatus({ state: "checking" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus({ state: "failed" }), CHECK_TIMEOUT_MS);
    window.instantsUpdates?.checkNow();
  }, [available]);

  return { status, check, available };
}
