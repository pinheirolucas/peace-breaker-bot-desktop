import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The contrast every palette has to keep, read straight from tokens.css.
 *
 *   text 4.5   fg and muted on the ground, muted on a panel, --ok as text,
 *              --onAccent on --accent, a card's --ink on its --fill
 *   text 4.5   --accent on the ground too: ghost buttons and links set it as text
 *   UI 3.0     --edge, the boundary of a field, secondary button, search, chip or switch
 *
 * --line is deliberately not here: it draws decorative hairlines, and a control
 * whose border is its only boundary uses --edge instead.
 *
 * oklch is converted to sRGB with gamut clamping, so a value can be off by a
 * tenth or so from what a browser's gamut mapping draws; the palette values
 * were tuned to clear these with a little margin.
 */

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

type Oklch = [number, number, number];

const themes = ["esmalte", "frevo", "cerrado", "brasa", "fliperama", "discord", "contraste", "oled"] as const;
const modes = ["light", "dark"] as const;

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  const out: Record<string, string> = {};

  for (const [, name, value] of (match?.[1] ?? "").matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }

  return out;
}

function parse(value: string, scope: Record<string, string>): Oklch {
  const alias = /^var\((--[\w-]+)\)$/.exec(value);

  if (alias) {
    return parse(scope[alias[1]], scope);
  }

  const n = [...value.matchAll(/[\d.]+/g)].map((m) => Number(m[0]));

  return [n[0], n[1] ?? 0, n[2] ?? 0];
}

function luminance([L, C, h]: Oklch): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function ratio(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (hi + 0.05) / (lo + 0.05);
}

describe.each(themes)("%s", (theme) => {
  const shared = declarations(`[data-theme="${theme}"]`);

  describe.each(modes)("%s", (mode) => {
    const scope = { ...shared, ...declarations(`[data-theme="${theme}"][data-mode="${mode}"]`) };
    const c = (name: string) => parse(scope[name], scope);

    it("keeps text legible on the ground and panel", () => {
      expect(ratio(c("--fg"), c("--bg"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("--muted"), c("--bg"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("--muted"), c("--panel"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("--ok"), c("--bg"))).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the label on an accent button legible", () => {
      expect(ratio(c("--onAccent"), c("--accent"))).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the accent legible as text and control edges visible as UI", () => {
      expect(ratio(c("--accent"), c("--bg"))).toBeGreaterThanOrEqual(4.5);
            expect(ratio(c("--edge"), c("--bg"))).toBeGreaterThanOrEqual(3);
      expect(ratio(c("--edge"), c("--panel"))).toBeGreaterThanOrEqual(3);
    });

    it("keeps every card's ink legible on its fill", () => {
      for (let i = 0; i < 6; i++) {
        expect(ratio(c(`--p${i}-ink`), c(`--p${i}-fill`)), `slot ${i}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
