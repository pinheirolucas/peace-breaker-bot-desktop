// The coloured dot in front of the tray menu's status line. Pure: colours and
// a tiny PNG encoder, so a native menu (which draws an image, not CSS) gets the
// same four states the renderer draws, with no image dependency.
//
// The window's dots are CSS (`.sdot`, `.dot`): amber and red are hardcoded
// oklch literals there, green is the palette's --ok. A native menu cannot take
// oklch or follow the palette, so these are fixed sRGB equivalents:
//   ok       oklch(0.62 0.15 145)   a mid green: --ok is 0.42 to 0.82 across
//                                   palettes, and one value has to read on a
//                                   light and a dark menu
//   warn     oklch(0.74 0.16 82)    the literal in quickAccess.css / controls.css
//   down     oklch(0.58 0.19 25)    the literal in quickAccess.css / controls.css
//   unknown  oklch(0.678 0.014 250) the dark palettes' --muted
// (converted with the standard OKLab -> sRGB matrices).

import { deflateSync } from "node:zlib";
import type { StatusTone } from "./presence";

export const dotColors: Record<StatusTone, string> = {
  ok: "#409D48",
  warn: "#DC9E00",
  down: "#D33A3C",
  unknown: "#9199A0"
};

/** Logical size of the image; the circle is 9 of these, centred. */
export const dotSize = 12;
const dotDiameter = 9;

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const table = crcTable();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** A filled, anti-aliased circle of `hex` on a transparent square, `scale` times dotSize wide, as an RGBA PNG. */
export function dotPng(hex: string, scale = 1): Buffer {
  const size = dotSize * scale;
  const radius = (dotDiameter * scale) / 2;
  const centre = size / 2;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rows: Buffer[] = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0, then RGBA
    for (let x = 0; x < size; x++) {
      // Coverage of the pixel by the disc, from how far its centre is inside the edge.
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      const alpha = Math.round(255 * Math.min(1, Math.max(0, radius - distance + 0.5)));
      row.set([r, g, b, alpha], 1 + x * 4);
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
