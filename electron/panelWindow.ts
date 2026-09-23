// Quick access's window: a small frameless BrowserWindow that opens under
// the tray icon and hides when it loses focus. The rules (where it opens, when
// blur hides it) are pure and tested in panel.ts; this is the wiring.

import { BrowserWindow, nativeTheme, screen } from "electron";
import type { Rectangle } from "electron";
import path from "node:path";
import { defaultChromeColors } from "./chrome";
import {
  dragCeilingMs,
  hidesOnBlur,
  panelBounds,
  panelShownChannel,
  panelSize,
  resizedBounds
} from "./panel";

/** A toggle this soon after a blur-hide is the same click that caused it. */
const reopenGuardMs = 250;

export interface PanelWindowDeps {
  isDev: boolean;
  /** Called with the window's webContents id when its renderer is gone. */
  onGone: (rendererId: number) => void;
  /** The renderer finished loading: it has missed everything sent before now. */
  onLoaded: (contents: Electron.WebContents) => void;
}

export function createPanelWindow({ isDev, onGone, onLoaded }: PanelWindowDeps) {
  let window: BrowserWindow | null = null;
  let rendererId = -1;
  let pinned = false;
  let dragging = false;
  let dragTimer: NodeJS.Timeout | null = null;
  let height: number = panelSize.height;
  let blurHiddenAt = 0;

  function create(): BrowserWindow {
    const colors = defaultChromeColors(nativeTheme.shouldUseDarkColors);

    const created = new BrowserWindow({
      width: panelSize.width,
      height: panelSize.height,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      // A first click on a card plays it; it does not first have to focus the panel.
      acceptFirstMouse: true,
      // Frosted where the OS can do it; a solid ground where it cannot.
      ...(process.platform === "darwin"
        ? { type: "panel", vibrancy: "popover", visualEffectState: "active", backgroundColor: "#00000000" }
        : process.platform === "win32"
          ? { backgroundMaterial: "acrylic", backgroundColor: "#00000000" }
          : { backgroundColor: colors.color }),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // Hidden, it still plays: a clip started here must not be throttled to a stop.
        backgroundThrottling: false
      }
    });

    rendererId = created.webContents.id;

    if (isDev) {
      void created.loadURL("http://localhost:3000/?panel=1");
    } else {
      void created.loadFile(path.join(__dirname, "index.html"), { query: { panel: "1" } });
    }

    created.webContents.on("did-finish-load", () => onLoaded(created.webContents));

    created.on("blur", () => {
      if (hidesOnBlur({ pinned, dragging })) {
        blurHiddenAt = Date.now();
        created.hide();
      }
    });

    created.on("closed", () => {
      onGone(rendererId);
      window = null;
      pinned = false;
      dragging = false;
    });

    return created;
  }

  function ensure(): BrowserWindow {
    if (!window || window.isDestroyed()) window = create();
    return window;
  }

  function areaFor(anchor: Rectangle | null) {
    const display = anchor && (anchor.width > 0 || anchor.height > 0)
      ? screen.getDisplayMatching(anchor)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return display.workArea;
  }

  function show(anchor: Rectangle | null): void {
    const panel = ensure();

    panel.setBounds(panelBounds(process.platform, anchor, areaFor(anchor), height));
    panel.show();
    panel.focus();
    // Every route in opens with the search field focused.
    panel.webContents.send(panelShownChannel);
  }

  function hide(): void {
    if (window && !window.isDestroyed()) window.hide();
  }

  function isOpen(): boolean {
    return Boolean(window && !window.isDestroyed() && window.isVisible());
  }

  function endDrag(): void {
    if (dragTimer) clearTimeout(dragTimer);
    dragTimer = null;

    if (!dragging) return;
    dragging = false;

    // The target app has taken focus by now; the blur that was held back is owed.
    if (window && !window.isDestroyed() && window.isVisible() && !window.isFocused() && !pinned) {
      window.hide();
    }
  }

  return {
    /** Creates the window ahead of time, so the first open does not wait for a renderer. */
    warm: () => void ensure(),
    /** Destroys it: the panel was switched off. */
    destroy: () => {
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    },
    show,
    hide,
    isOpen,
    /** Toggles: a click on an open, focused panel closes it. */
    toggle: (anchor: Rectangle | null) => {
      if (isOpen()) {
        hide();
        return;
      }

      // Clicking the icon blurs the panel first, which hides it, and only then
      // delivers the click: without this the click would open it again at once.
      if (Date.now() - blurHiddenAt < reopenGuardMs) return;
      show(anchor);
    },
    webContents: () => (window && !window.isDestroyed() ? window.webContents : null),
    rendererId: () => rendererId,
    setPinned: (next: boolean) => {
      pinned = next;
      if (window && !window.isDestroyed()) window.setAlwaysOnTop(next, "floating");
    },
    /** Conexão hugs its content; the edge the icon anchors it by stays put. */
    resize: (next: number) => {
      const panel = window;
      if (!panel || panel.isDestroyed()) return;

      const bounds = panel.getBounds();
      const box = resizedBounds(bounds, next, screen.getDisplayMatching(bounds).workArea);
      height = box.height;
      panel.setBounds(box);
    },
    /** A drag that began in the panel is in flight: the blur it causes must not hide it. */
    beginDrag: () => {
      dragging = true;
      if (dragTimer) clearTimeout(dragTimer);
      dragTimer = setTimeout(endDrag, dragCeilingMs);
    },
    endDrag
  };
}

export type PanelWindow = ReturnType<typeof createPanelWindow>;

