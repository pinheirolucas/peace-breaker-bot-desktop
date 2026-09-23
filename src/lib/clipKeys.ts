import type { Instant } from "../storage";

// Letters and digits only: punctuation and Ç move between layouts.
const CLIP_KEY = /^[a-z0-9]$/;

export function isClipKey(value: unknown): value is string {
  return typeof value === "string" && CLIP_KEY.test(value);
}

interface KeyLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
}

/** The clip key a keydown stands for, or null. Uses `event.code` only for Shift + digit, where `key` is "!". */
export function clipKeyFromEvent(event: KeyLike): string | null {
  const key = event.key.toLowerCase();
  if (isClipKey(key)) {
    return key;
  }

  const digit = /^Digit([0-9])$/.exec(event.code ?? "");
  return event.shiftKey && digit ? digit[1] : null;
}

/** Assigns a key (null clears it), taking it from any other sound. Returns that sound as `displaced`. */
export function assignKey(
  instants: Instant[],
  url: string,
  key: string | null
): { instants: Instant[]; displaced: Instant | null } {
  const displaced =
    key === null ? null : (instants.find((item) => item.key === key && item.url !== url) ?? null);

  return {
    displaced,
    instants: instants.map((item) => {
      if (item.url === url) {
        const { key: _old, ...rest } = item;
        return key === null ? rest : { ...rest, key };
      }

      if (displaced && item.url === displaced.url) {
        const { key: _taken, ...rest } = item;
        return rest;
      }

      return item;
    })
  };
}

/** Drops invalid keys and duplicates, including any in `taken`. */
export function sanitizeKeys(instants: Instant[], taken: Iterable<string> = []): Instant[] {
  const seen = new Set(taken);

  return instants.map((item) => {
    const { key, ...rest } = item;
    if (isClipKey(key) && !seen.has(key)) {
      seen.add(key);
      return item;
    }
    return rest;
  });
}

/** Adds new urls only; a stored favourite wins, and a colliding imported key is dropped. */
export function mergeImported(stored: Instant[], incoming: Instant[]): Instant[] {
  const urls = new Set(stored.map(({ url }) => url));
  const fresh = incoming.filter(({ url }) => !urls.has(url));
  const used = stored.flatMap(({ key }) => (key ? [key] : []));

  return [...stored, ...sanitizeKeys(fresh, used)];
}

/** Whether the target is a text field. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;

  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/** Whether a dialog or menu is open. */
export function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
