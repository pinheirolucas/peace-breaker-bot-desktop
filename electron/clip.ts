// Pure rules for dragging a clip out of the app as a file, inlined into the
// sandboxed preload like chrome.ts. The renderer is untrusted: everything it
// sends goes through isClipRequest in the main process before a byte is
// fetched or a file is written.

/** renderer -> main: start preparing the file (on pointer down). */
export const clipPrepareChannel = "clip:prepare";
/** renderer -> main: the pointer travelled far enough; start the OS drag. */
export const clipDragChannel = "clip:drag";
/** renderer -> main: show the file in the file manager. */
export const clipRevealChannel = "clip:reveal";

export interface ClipRequest {
  name: string;
  url: string;
}

/** "ready" only says the file exists; "failed" covers every reason it could not. */
export type ClipPrepareResult = "ready" | "failed";
export type ClipDragResult = "started" | "failed";

/** How long a drag waits for a file that is still being prepared. */
export const dragWaitMs = 400;

/** The pointer distance, in px, below which a press is still a click. */
export const dragThreshold = 6;

const maxName = 300;
const maxUrl = 2048;
const maxBase = 60;

export function isClipRequest(x: unknown): x is ClipRequest {
  const request = x as Partial<ClipRequest> | null;

  if (!request || typeof request !== "object") return false;
  if (typeof request.name !== "string" || request.name.length === 0 || request.name.length > maxName) {
    return false;
  }
  if (typeof request.url !== "string" || request.url.length > maxUrl) return false;

  try {
    const url = new URL(request.url);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "";
  } catch {
    return false;
  }
}

// Names Windows refuses as a file's base name, whatever the extension.
const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * "Vine boom!" -> "vine-boom.mp3". Accents fold to their letter, anything
 * else that is not a letter or digit becomes one hyphen, and a name already in
 * `taken` gets "-2", "-3"… so two clips called the same never overwrite each
 * other. `taken` holds complete file names.
 */
export function clipFileName(name: string, taken: ReadonlySet<string> | readonly string[] = []): string {
  const used = new Set(taken);

  let base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxBase)
    .replace(/-+$/g, "");

  if (base === "") base = "clip";
  if (reserved.test(base)) base = `${base}-clip`;

  let candidate = `${base}.mp3`;
  for (let n = 2; used.has(candidate); n += 1) {
    candidate = `${base}-${n}.mp3`;
  }

  return candidate;
}

/** The bytes of a `data:` URI, or null for anything that is not base64 audio. */
export function dataUriBytes(uri: string): Uint8Array | null {
  const match = /^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,([A-Za-z0-9+/=\s]*)$/i.exec(uri);
  if (!match) return null;

  const bytes = Uint8Array.from(Buffer.from(match[1], "base64"));
  return bytes.length > 0 ? bytes : null;
}
