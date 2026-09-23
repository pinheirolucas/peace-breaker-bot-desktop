// The quick panel's pure rules, inlined into the sandboxed preload like
// chrome.ts: where it opens, how it may be resized, and what an untrusted
// renderer may ask of it. The panel is a second renderer, so main validates
// everything it sends the way it does the window's.

import { modifiersFor } from "./shortcuts";
import type { GlobalModifier } from "./shortcuts";

export const panelActionChannel = "panel:action";
export const panelShownChannel = "panel:shown";
export const panelShortcutSetChannel = "panel-shortcut:set";

export const panelSize = { width: 360, height: 520 } as const;
/** The Conexão style hugs its content between these; Favoritos is always the top one. */
export const panelMinHeight = 260;

export type PanelAction =
  | { type: "hide" }
  | { type: "open-app" }
  | { type: "refresh" }
  | { type: "settings" }
  | { type: "quit" }
  | { type: "pin"; pinned: boolean }
  | { type: "resize"; height: number };

const simpleActions: readonly string[] = ["hide", "open-app", "refresh", "settings", "quit"];

export function isPanelAction(x: unknown): x is PanelAction {
  const action = x as Record<string, unknown> | null;
  if (!action || typeof action !== "object" || typeof action.type !== "string") return false;

  if (simpleActions.includes(action.type)) return true;
  if (action.type === "pin") return typeof action.pinned === "boolean";
  if (action.type === "resize") {
    return typeof action.height === "number" && Number.isFinite(action.height);
  }
  return false;
}

/** Whatever the renderer measured, held to what the panel may be. */
export function clampHeight(height: number): number {
  return Math.round(Math.min(panelSize.height, Math.max(panelMinHeight, height)));
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const edge = 8;
const gap = 6;

function within(value: number, low: number, high: number): number {
  return Math.round(Math.max(low, Math.min(high, value)));
}

/** Keeps the panel wholly inside the work area, with a small margin. */
function clamped(box: Box, area: Box): Box {
  return {
    ...box,
    x: within(box.x, area.x + edge, area.x + area.width - box.width - edge),
    y: within(box.y, area.y + edge, area.y + area.height - box.height - edge)
  };
}

/**
 * Where the panel opens. macOS hangs it under the menu-bar icon; Windows sits
 * it above the notification area when the icon is in the lower half of the
 * display (below it otherwise); both are clamped to the work area, so an icon
 * at a screen edge never pushes it off. Linux has no anchor: a small floating
 * window centred on the display. An icon whose bounds are unknown (an empty
 * rectangle, GNOME with no tray) is treated the same way.
 */
export function panelBounds(
  platform: string,
  anchor: Box | null,
  area: Box,
  height: number = panelSize.height
): Box {
  const size = { width: panelSize.width, height };
  const known = anchor !== null && (anchor.width > 0 || anchor.height > 0);

  if (platform === "linux" || !known) {
    return clamped(
      {
        ...size,
        x: area.x + (area.width - size.width) / 2,
        y: area.y + (area.height - size.height) / 2
      },
      area
    );
  }

  const centre = anchor.x + anchor.width / 2;
  const iconIsLow = anchor.y + anchor.height / 2 > area.y + area.height / 2;
  const below = platform === "darwin" || !iconIsLow;

  return clamped(
    {
      ...size,
      x: centre - size.width / 2,
      y: below ? anchor.y + anchor.height + gap : anchor.y - size.height - gap
    },
    area
  );
}

/**
 * A new height for an open panel, holding the edge the icon anchors it by:
 * the top when it hangs below the icon, the bottom when it sits above.
 */
export function resizedBounds(box: Box, height: number, area: Box): Box {
  const next = clampHeight(height);
  const wasAbove = box.y + box.height > area.y + area.height / 2 && box.y > area.y + edge;
  const y = wasAbove ? box.y + box.height - next : box.y;

  return clamped({ ...box, y, height: next }, area);
}

/** The panel's own global shortcut: one key, a modifier preset. */
export interface PanelShortcutRequest {
  enabled: boolean;
  modifier: GlobalModifier;
}

export const panelShortcutKey = "p";

export function isPanelShortcutRequest(x: unknown, platform: string): x is PanelShortcutRequest {
  const request = x as Partial<PanelShortcutRequest> | null;
  if (!request || typeof request !== "object" || typeof request.enabled !== "boolean") return false;

  return modifiersFor(platform).includes(request.modifier as GlobalModifier);
}

/** Focus left the panel: it hides, unless pinned or a drag that began in it is still in flight. */
export function hidesOnBlur(state: { pinned: boolean; dragging: boolean }): boolean {
  return !state.pinned && !state.dragging;
}

/** How long a drag from the panel may keep it open if the pointer never reports coming back. */
export const dragCeilingMs = 30_000;

/**
 * Esc in the panel: playback first, then a typed query, then the panel itself
 * (even when pinned). So a stray Esc mid-call never loses your place.
 */
export function escapeAction(state: { playing: boolean; query: string }): "stop" | "clear" | "hide" {
  if (state.playing) return "stop";
  return state.query !== "" ? "clear" : "hide";
}
