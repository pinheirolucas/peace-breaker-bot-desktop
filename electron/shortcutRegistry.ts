import { acceleratorFor, shortcutsFiredChannel } from "./shortcuts";
import type { ShortcutRequest, ShortcutResult } from "./shortcuts";

/** The slice of Electron's globalShortcut this needs, so it can be faked. */
export interface AcceleratorRegistry {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
}

export interface ShortcutRegistryOptions {
  registry: AcceleratorRegistry;
  /** Called with the channel and key when a registered combo fires. */
  send: (channel: string, key: string) => void;
  /** Wayland without a portal registers nothing, which is not the same as every combo being taken. */
  wayland?: boolean;
  now?: () => number;
}

/** Ignores a repeat of the same combo within this window, since holding one can auto-repeat. */
export const shortcutDebounceMs = 250;

/**
 * Registers global shortcuts and releases only the ones it registered, so a
 * combo owned by another app is never touched.
 */
export function createShortcutRegistry({
  registry,
  send,
  wayland = false,
  now = Date.now
}: ShortcutRegistryOptions) {
  let registered: string[] = [];
  let enabled = false;
  const lastFired = new Map<string, number>();

  function release(): void {
    registered.forEach((accelerator) => registry.unregister(accelerator));
    registered = [];
    lastFired.clear();
  }

  function register(request: ShortcutRequest): ShortcutResult {
    const result: ShortcutResult = { registered: [], failed: [] };

    for (const key of request.keys) {
      const accelerator = acceleratorFor(request.modifier, key);
      let ok = false;

      try {
        ok = registry.register(accelerator, () => {
          const at = now();
          if (at - (lastFired.get(key) ?? -Infinity) < shortcutDebounceMs) {
            return;
          }
          lastFired.set(key, at);
          send(shortcutsFiredChannel, key);
        });
      } catch {
        ok = false;
      }

      if (ok) {
        registered.push(accelerator);
        result.registered.push(key);
      } else {
        result.failed.push({ key, reason: "in-use" });
      }
    }

    if (wayland && request.keys.length > 0 && result.registered.length === 0) {
      result.failed = result.failed.map(({ key }) => ({ key, reason: "unsupported" as const }));
    }

    return result;
  }

  return {
    /** Replaces whatever was registered with what the request asks for. */
    apply(request: ShortcutRequest): ShortcutResult {
      release();
      enabled = request.enabled;
      return request.enabled ? register(request) : { registered: [], failed: [] };
    },
    release,
    /** Releases everything and marks global keys off. */
    reset(): void {
      release();
      enabled = false;
    },
    get enabled() {
      return enabled;
    }
  };
}

/** On macOS the app outlives its window, so closing hides it while global keys need the renderer. */
export function shouldHideOnClose(platform: string, globalKeysEnabled: boolean, quitting: boolean) {
  return platform === "darwin" && globalKeysEnabled && !quitting;
}
