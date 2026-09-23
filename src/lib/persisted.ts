import { useCallback, useEffect, useRef, useState } from "react";

// Drop-in replacement for use-persisted-state, which is unmaintained and
// ships no types. Same [value, setValue] shape and same JSON encoding, so
// exported backups stay readable — and the same two kinds of sync, both of
// which matter here:
//
//   within a window  several components hold a hook on the same key at
//                    once (ImportForm writes "instants" while the favourites
//                    grid reads it). The storage event never fires in the
//                    window that made the write, so these are kept in step
//                    through a per-key registry below.
//   across windows   a second window of the app shares localStorage and
//                    learns about writes through the storage event.

type Updater<T> = T | ((previous: T) => T);
export type SetPersisted<T> = (next: Updater<T>) => void;

/** What a listener is told when its key is removed rather than written: back to its default. */
const CLEARED = Symbol("cleared");

type Listener = (value: unknown) => void;
const channels = new Map<string, Set<Listener>>();

function subscribe(key: string, listener: Listener): () => void {
  let listeners = channels.get(key);
  if (!listeners) {
    listeners = new Set();
    channels.set(key, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      channels.delete(key);
    }
  };
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    return parse(window.localStorage.getItem(key), fallback);
  } catch {
    // Private mode, or storage disabled entirely.
    return fallback;
  }
}

/**
 * Removes keys, so every hook on them falls back to its own default — in this
 * window through the registry, and in the others through the storage event,
 * whose `newValue` is null for a removal. Not the same as writing the default:
 * an absent key is what "never chosen" means to the language and the server.
 */
export function clearPersisted(keys: readonly string[]): void {
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage disabled: there is nothing stored to remove.
    }

    channels.get(key)?.forEach((listener) => listener(CLEARED));
  }
}

export function createPersistedState<T>(key: string) {
  return function usePersistedState(defaultValue: T): [T, SetPersisted<T>] {
    const [value, setValue] = useState<T>(() => read(key, defaultValue));

    // The latest value, so a functional update resolves against it and the
    // resolved value can be broadcast to the other instances — which cannot
    // happen from inside a setState updater, since React may run those twice.
    const current = useRef(value);
    current.current = value;

    // Held in a ref so an inline default — useInstantsState([]) — does not
    // resubscribe the listeners on every render.
    const fallback = useRef(defaultValue);
    fallback.current = defaultValue;

    // This instance's own listener, so a broadcast can skip its sender.
    const self = useRef<Listener>((next) => {
      const resolved = next === CLEARED ? fallback.current : (next as T);
      current.current = resolved;
      setValue(resolved);
    });

    const set = useCallback<SetPersisted<T>>((next) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: T) => T)(current.current)
          : next;

      current.current = resolved;
      setValue(resolved);

      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Nothing useful to do: keep the in-memory value so the session
        // still works, and let the next write try again.
      }

      channels.get(key)?.forEach((listener) => {
        if (listener !== self.current) {
          listener(resolved);
        }
      });
    }, []);

    useEffect(() => subscribe(key, self.current), []);

    useEffect(() => {
      function onStorage(event: StorageEvent) {
        if (event.key !== key || event.storageArea !== window.localStorage) {
          return;
        }

        setValue(parse(event.newValue, fallback.current));
      }

      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }, []);

    return [value, set];
  };
}
