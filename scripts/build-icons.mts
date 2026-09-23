// Rasterises the Fita SVG masters in assets/icon/ into everything the
// packaged app and the web build need. Run with `pnpm icons` after editing a
// master; the output is committed, so `pnpm build` never needs sharp.
//
//   resources/icon.icns          macOS app bundle (squircle, Apple's inset)
//   resources/icon.ico           Windows (8% tile)
//   resources/icons/NxN.png      Linux packages (circle)
//   public/icon.png              Linux running-window icon (no bundle there)
//   public/favicon.svg, .ico     the browser tab
//   public/tray/                 the tray glyph, four states (fita-tray-*.svg)

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ICNS_TYPES, packIcns, packIco } from "./icon-formats.mts";

const root = path.resolve(import.meta.dirname, "..");
const master = (name: string) => path.join(root, "assets/icon", name);
const out = (...parts: string[]) => path.join(root, ...parts);

/** Rasterises the vector at exactly `size` — density scales the SVG's own
 *  width to it — rather than rendering once large and shrinking. */
async function raster(svgFile: string, size: number) {
  const svg = await fs.readFile(svgFile);
  const { width = 1024 } = await sharp(svg).metadata();
  return sharp(svg, { density: (72 * size) / width }).resize(size, size);
}

async function render(svgFile: string, size: number): Promise<Buffer> {
  return (await raster(svgFile, size)).png({ compressionLevel: 9 }).toBuffer();
}

/** Straight RGBA pixels, for the icns types that store raw ARGB. */
async function renderRgba(svgFile: string, size: number): Promise<Buffer> {
  return (await raster(svgFile, size)).ensureAlpha().raw().toBuffer();
}

async function write(file: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  console.log(`  ${path.relative(root, file).padEnd(30)} ${bytes.length.toLocaleString("en")} B`);
}

console.log("Fita:");

const mac = new Map<number, { png?: Buffer; rgba?: Buffer }>();
for (const [, size, kind] of ICNS_TYPES) {
  const image = mac.get(size) ?? {};
  if (kind === "argb") image.rgba = await renderRgba(master("fita-mac.svg"), size);
  else image.png = await render(master("fita-mac.svg"), size);
  mac.set(size, image);
}
await write(out("resources/icon.icns"), packIcns(mac));

const winSizes = [16, 24, 32, 48, 64, 128, 256];
const win = await Promise.all(winSizes.map(async (size) => ({ size, png: await render(master("fita-win.svg"), size) })));
await write(out("resources/icon.ico"), packIco(win));

for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  await write(out(`resources/icons/${size}x${size}.png`), await render(master("fita-linux.svg"), size));
}
await write(out("public/icon.png"), await render(master("fita-linux.svg"), 512));

await write(out("public/favicon.svg"), await fs.readFile(master("favicon.svg")));
const tab = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await render(master("favicon.svg"), size) })));
await write(out("public/favicon.ico"), packIco(tab));

// The tray glyph: four shapes of Fita in one ink. macOS reads only alpha from a
// "Template" image and tints it itself, so it gets black ink and the OS does
// the light/dark; Windows and Linux draw the file as it is, so they get a
// white cut for a dark tray and a black one for a light tray. Each size is
// rendered from the vector at that size: 18px and 36px (@2x) on macOS, 16px
// and 32px elsewhere.
console.log("Tray:");
const trayStates = ["connected", "playing", "idle", "off"];

async function renderInk(svgFile: string, size: number, ink: string): Promise<Buffer> {
  const svg = (await fs.readFile(svgFile, "utf8")).replaceAll("#000", ink);
  return sharp(Buffer.from(svg), { density: (72 * size) / 96 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

for (const state of trayStates) {
  const file = master(`fita-tray-${state}.svg`);

  await write(out(`public/tray/${state}Template.png`), await renderInk(file, 18, "#000"));
  await write(out(`public/tray/${state}Template@2x.png`), await renderInk(file, 36, "#000"));

  for (const [tone, ink] of [["light", "#fff"], ["dark", "#000"]] as const) {
    await write(out(`public/tray/${state}-${tone}.png`), await renderInk(file, 16, ink));
    await write(out(`public/tray/${state}-${tone}@2x.png`), await renderInk(file, 32, ink));
  }
}
