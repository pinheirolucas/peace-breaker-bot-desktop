// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clipFileName, dataUriBytes, isClipRequest } from "../electron/clip";
import { createClipStore } from "../electron/clipStore";

describe("isClipRequest", () => {
  const ok = { name: "Vine boom", url: "https://www.myinstants.com/media/sounds/vine.mp3" };

  it("accepts a name and an http(s) url", () => {
    expect(isClipRequest(ok)).toBe(true);
    expect(isClipRequest({ ...ok, url: "http://localhost/x.mp3" })).toBe(true);
  });

  it.each([
    null,
    "x",
    {},
    { ...ok, name: "" },
    { ...ok, name: "a".repeat(301) },
    { ...ok, name: 3 },
    { ...ok, url: "file:///etc/passwd" },
    { ...ok, url: "javascript:alert(1)" },
    { ...ok, url: "not a url" },
    { ...ok, url: `https://x.com/${"a".repeat(2100)}` }
  ])("refuses %j", (value) => {
    expect(isClipRequest(value)).toBe(false);
  });
});

describe("clipFileName", () => {
  it("makes a lowercase, hyphenated mp3 name", () => {
    expect(clipFileName("Vine boom")).toBe("vine-boom.mp3");
    expect(clipFileName("  Não  é  possível!! ")).toBe("nao-e-possivel.mp3");
  });

  it("never lets a name climb out of the folder", () => {
    expect(clipFileName("../../etc/passwd")).toBe("etc-passwd.mp3");
    expect(clipFileName("a\\b:c")).toBe("a-b-c.mp3");
  });

  it("falls back for a name with no letters or digits", () => {
    expect(clipFileName("!!!")).toBe("clip.mp3");
    expect(clipFileName("😀")).toBe("clip.mp3");
  });

  it("avoids names Windows reserves", () => {
    expect(clipFileName("nul")).toBe("nul-clip.mp3");
  });

  it("numbers a collision from 2", () => {
    const taken = new Set(["vine-boom.mp3"]);
    expect(clipFileName("Vine Boom", taken)).toBe("vine-boom-2.mp3");
    taken.add("vine-boom-2.mp3");
    expect(clipFileName("vine boom", taken)).toBe("vine-boom-3.mp3");
  });

  it("caps the length", () => {
    expect(clipFileName("a".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe("dataUriBytes", () => {
  it("decodes base64 audio", () => {
    const bytes = dataUriBytes(`data:audio/mpeg;base64,${Buffer.from("abc").toString("base64")}`);
    expect(Array.from(bytes ?? [])).toEqual([97, 98, 99]);
  });

  it("refuses anything else", () => {
    expect(dataUriBytes("data:text/html;base64,PGI+")).toBeNull();
    expect(dataUriBytes("https://example.com/a.mp3")).toBeNull();
    expect(dataUriBytes("data:audio/mpeg;base64,")).toBeNull();
  });
});

describe("createClipStore", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = "";
  });

  async function store(fetchBytes: (url: string) => Promise<Uint8Array | null>) {
    dir = path.join(await mkdtemp(path.join(os.tmpdir(), "clip-")), "clips");
    return createClipStore({ dir, fetchBytes });
  }

  it("writes each url once and hands back the same file", async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const clips = await store(fetchBytes);

    const first = await clips.prepare({ name: "Vine boom", url: "https://a/x.mp3" });
    const again = await clips.prepare({ name: "Vine boom", url: "https://a/x.mp3" });

    expect(first).toBe(again);
    expect(path.basename(first ?? "")).toBe("vine-boom.mp3");
    expect(Array.from(await readFile(first ?? ""))).toEqual([1, 2, 3]);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it("keeps two clips with one name apart", async () => {
    const clips = await store(async () => new Uint8Array([1]));

    const a = await clips.prepare({ name: "Boom", url: "https://a/1.mp3" });
    const b = await clips.prepare({ name: "Boom", url: "https://a/2.mp3" });

    expect([path.basename(a ?? ""), path.basename(b ?? "")]).toEqual(["boom.mp3", "boom-2.mp3"]);
  });

  it("reports a failure and tries again next time", async () => {
    const fetchBytes = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(new Uint8Array([1]));
    const clips = await store(fetchBytes);
    const request = { name: "Boom", url: "https://a/1.mp3" };

    expect(await clips.prepare(request)).toBeNull();
    expect(await clips.prepare(request)).not.toBeNull();
  });

  it("gives up waiting on a slow file", async () => {
    const clips = await store(() => new Promise(() => {}));
    void clips.prepare({ name: "Boom", url: "https://a/1.mp3" });

    expect(await clips.ready("https://a/1.mp3", 10)).toBeNull();
    expect(await clips.ready("https://a/never.mp3", 10)).toBeNull();
  });

  it("removes the folder on sweep", async () => {
    const clips = await store(async () => new Uint8Array([1]));
    await clips.prepare({ name: "Boom", url: "https://a/1.mp3" });
    const parent = path.dirname(dir);

    await clips.sweep();

    expect(await readdir(parent)).toEqual([]);
  });
});
