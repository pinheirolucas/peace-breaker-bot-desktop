// The temp folder dragged clips are written to. Files are prepared when a
// card is pressed and kept for the session, so the drag itself only has to
// hand the OS a path. The folder is removed on quit and swept at launch.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { clipFileName, dragWaitMs } from "./clip";
import type { ClipRequest } from "./clip";

export interface ClipStoreDeps {
  dir: string;
  /** The clip's bytes, or null when the server has none. Never throws for a missing clip. */
  fetchBytes: (url: string) => Promise<Uint8Array | null>;
}

export interface ClipStore {
  /** Writes the clip's file, once per url; resolves to its path, or null on failure. */
  prepare: (request: ClipRequest) => Promise<string | null>;
  /** The prepared file for a url, waiting up to `waitMs` for one in flight. */
  ready: (url: string, waitMs?: number) => Promise<string | null>;
  /** Empties the folder: at launch, for what a crash left, and on quit. */
  sweep: () => Promise<void>;
}

export function createClipStore({ dir, fetchBytes }: ClipStoreDeps): ClipStore {
  const files = new Map<string, Promise<string | null>>();
  const taken = new Set<string>();

  async function write(request: ClipRequest): Promise<string | null> {
    try {
      const bytes = await fetchBytes(request.url);
      if (!bytes) return null;

      const file = clipFileName(request.name, taken);
      taken.add(file);

      await mkdir(dir, { recursive: true });
      const target = path.join(dir, file);
      await writeFile(target, bytes);
      return target;
    } catch {
      return null;
    }
  }

  function prepare(request: ClipRequest): Promise<string | null> {
    let pending = files.get(request.url);

    if (!pending) {
      pending = write(request).then((result) => {
        // A failure is not cached: the next press tries again.
        if (result === null) files.delete(request.url);
        return result;
      });
      files.set(request.url, pending);
    }

    return pending;
  }

  async function ready(url: string, waitMs = dragWaitMs): Promise<string | null> {
    const pending = files.get(url);
    if (!pending) return null;

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
    return Promise.race([pending, timeout]);
  }

  async function sweep(): Promise<void> {
    files.clear();
    taken.clear();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  return { prepare, ready, sweep };
}
