// Configurações' window: a second, ordinary BrowserWindow — not modal, one
// instance, opening on a section, remembering where it was left. It is the same
// index.html as the main window at #/settings, with the same preload and
// webPreferences. The rules (sections, the hash, which saved bounds to trust)
// are pure and tested in settings.ts; this is the wiring.

import { app, BrowserWindow, nativeTheme, screen } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultChromeColors, windowChromeFor } from "./chrome";
import type { Desktop } from "./chrome";
import {
  hashFor,
  isSettingsPane,
  restoreBounds,
  settingsMinSize,
  settingsSectionChannel,
  settingsSize
} from "./settings";
import type { SettingsSection } from "./settings";

export interface SettingsWindowDeps {
  isDev: boolean;
  desktop: Desktop | undefined;
  /** The renderer finished loading: it has missed everything sent before now. */
  onLoaded: (contents: Electron.WebContents) => void;
}

function boundsFile(): string {
  return path.join(app.getPath("userData"), "settings-window.json");
}

function readBounds() {
  try {
    const saved: unknown = JSON.parse(readFileSync(boundsFile(), "utf8"));
    return restoreBounds(saved, screen.getAllDisplays().map((display) => display.workArea));
  } catch {
    return null;
  }
}

function writeBounds(bounds: Electron.Rectangle): void {
  try {
    writeFileSync(boundsFile(), JSON.stringify(bounds));
  } catch {
    // Not remembering where the window was is not worth an error.
  }
}

export function createSettingsWindow({ isDev, desktop, onLoaded }: SettingsWindowDeps) {
  let window: BrowserWindow | null = null;

  function create(section: SettingsSection | undefined): BrowserWindow {
    const colors = defaultChromeColors(nativeTheme.shouldUseDarkColors);
    const restored = readBounds();

    const created = new BrowserWindow({
      ...(restored ?? settingsSize),
      minWidth: settingsMinSize.width,
      minHeight: settingsMinSize.height,
      ...(restored ? {} : { center: true }),
      show: false,
      fullscreenable: false,
      backgroundColor: colors.color,
      ...windowChromeFor(process.platform, colors, desktop),
      ...(process.platform === "linux" ? { icon: path.join(__dirname, "icon.png") } : {}),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const hash = hashFor(isSettingsPane(section) ? section : undefined);

    if (isDev) {
      void created.loadURL(`http://localhost:3000/${hash}`);
    } else {
      void created.loadFile(path.join(__dirname, "index.html"), { hash: hash.slice(1) });
    }

    created.once("ready-to-show", () => created.show());
    created.webContents.once("did-fail-load", () => created.show());
    created.webContents.on("did-finish-load", () => onLoaded(created.webContents));

    // Windows and Linux: the toolbar is the title bar. The application menu is
    // still there for its accelerators, so it is hidden rather than removed.
    if (process.platform !== "darwin") created.setMenuBarVisibility(false);

    // getNormalBounds, so a maximised or minimised window remembers its real size.
    created.on("close", () => writeBounds(created.getNormalBounds()));
    created.on("closed", () => {
      window = null;
    });

    return created;
  }

  return {
    /** Opens Configurações, or raises it when it is open, jumping to `section` if one is given. */
    open: (section?: SettingsSection) => {
      if (!window || window.isDestroyed()) {
        window = create(section);
        return;
      }

      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();

      if (section !== undefined) window.webContents.send(settingsSectionChannel, section);
    },
    webContents: () => (window && !window.isDestroyed() ? window.webContents : null),
    /** The main window went away: there is nothing left for its settings to be about. */
    destroy: () => {
      if (window && !window.isDestroyed()) window.close();
      window = null;
    }
  };
}

export type SettingsWindow = ReturnType<typeof createSettingsWindow>;
