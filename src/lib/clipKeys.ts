import type { Instant } from "../storage";

/** A favourite's key: one letter or digit, lower case, as the keyboard
 *  prints it. Ç and punctuation are out — they move between layouts and
 *  would break a backup restored on another machine. */
const CLIP_KEY = /^[a-z0-9]$/;

export function isClipKey(value: unknown): value is string {
  return typeof value === "string" && CLIP_KEY.test(value);
}

interface KeyLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
}

/**
 * The clip key a keydown stands for, or null. Matched on `event.key` so the
 * keycap reads what the keyboard prints (ABNT2 and AZERTY alike). With Shift
 * a digit row key reports "!" rather than "1", so that one case falls back
 * to `event.code`.
 */
export function clipKeyFromEvent(event: KeyLike): string | null {
  const key = event.key.toLowerCase();
  if (isClipKey(key)) {
    return key;
  }

  const digit = /^Digit([0-9])$/.exec(event.code ?? "");
  return event.shiftKey && digit ? digit[1] : null;
}

/**
 * One key per sound and one sound per key. Returns the new list and the
 * sound the key was taken from, for the undo toast. A null key clears it.
 */
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

/** Drops keys that are not valid or repeat one already seen, so a hand-edited
 *  or older backup can never give two sounds the same key. */
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

/** "Manter os meus": a stored favourite wins, and an imported key that
 *  collides with a stored one is dropped. */
export function mergeImported(stored: Instant[], incoming: Instant[]): Instant[] {
  const urls = new Set(stored.map(({ url }) => url));
  const fresh = incoming.filter(({ url }) => !urls.has(url));
  const used = stored.flatMap(({ key }) => (key ? [key] : []));

  return [...stored, ...sanitizeKeys(fresh, used)];
}

/** Whether a keydown target is somewhere a letter means something else. */
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

/** A Radix dialog or menu is open. Closed ones unmount, so presence is enough. */
export function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
