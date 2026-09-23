import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, net, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Bonjour } from "bonjour-service";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";
import {
  buildServer,
  discoveryProtocol,
  discoveryQueryInterval,
  discoveryRefreshChannel,
  discoveryServersChannel,
  discoveryType,
  sortServers
} from "./discovery";
import type { DiscoveredService, Server } from "./discovery";
import {
  chromeChannel,
  defaultChromeColors,
  desktopFor,
  isChromeColors,
  minWindowWidth,
  titleBarHeight,
  windowChromeFor
} from "./chrome";
import {
  acceleratorFor,
  isShortcutRequest,
  shortcutsFiredChannel,
  shortcutsSetChannel
} from "./shortcuts";
import type { ShortcutResult } from "./shortcuts";
import {
  checkForUpdatesChannel,
  checkForUpdatesLabel,
  openReleasePageChannel,
  openUpdateChannel,
  pickDmgUrl,
  releasePageUrl,
  restartToUpdateChannel,
  updateAvailableChannel,
  updateCheckFailedChannel,
  updateDownloadedChannel,
  updateNotAvailableChannel,
  updateRestartReadyChannel
} from "./updates";

// Dev is "not packaged". This used to be the electron-is-dev package, which
// went ESM-only in v3 and so cannot be required from a CommonJS bundle.
const isDev = !app.isPackaged;

// Only meaningful on Linux; see desktopFor.
const desktop = desktopFor(process.platform, process.env.XDG_CURRENT_DESKTOP);

let mainWindow: BrowserWindow | null = null;
let bonjour: Bonjour | null = null;
let browser: ReturnType<Bonjour["find"]> | null = null;
let discoveryTimer: NodeJS.Timeout | null = null;
let discovered = new Map<string, Server>();

// The version whose dmg has already been fetched (or is being fetched), so a
// later hourly check doesn't re-download it while it's sitting there unopened.
let macUpdateVersion: string | null = null;

// Set right before a menu-triggered check, cleared by whichever terminal
// event answers it. The hourly background check never sets this, so it
// stays exactly as silent on "no update"/"check failed" as it always was —
// only a check a person actually asked for gets an answer either way.
let manualCheckPending = false;

let registeredAccelerators: string[] = [];
let globalKeysEnabled = false;
let isQuitting = false;
const lastFired = new Map<string, number>();

const shortcutDebounceMs = 250;

// Wayland apps can't grab keys themselves; Chromium goes through the portal. Set before "ready".
if (process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland") {
  app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
}

function releaseGlobalShortcuts(): void {
  registeredAccelerators.forEach((accelerator) => globalShortcut.unregister(accelerator));
  registeredAccelerators = [];
  lastFired.clear();
}

function registerGlobalShortcuts(modifier: Parameters<typeof acceleratorFor>[0], keys: string[]): ShortcutResult {
  const result: ShortcutResult = { registered: [], failed: [] };
  const wayland = process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland";

  for (const key of keys) {
    const accelerator = acceleratorFor(modifier, key);
    let ok = false;

    try {
      ok = globalShortcut.register(accelerator, () => {
        const now = Date.now();
        if (now - (lastFired.get(key) ?? 0) < shortcutDebounceMs) {
          return;
        }
        lastFired.set(key, now);
        sendToWindow(shortcutsFiredChannel, key);
      });
    } catch {
      ok = false;
    }

    if (ok) {
      registeredAccelerators.push(accelerator);
      result.registered.push(key);
    } else {
      result.failed.push({ key, reason: "in-use" });
    }
  }

  // Nothing registered on Wayland means no portal, not that every combo is taken.
  if (wayland && keys.length > 0 && result.registered.length === 0) {
    result.failed = result.failed.map(({ key }) => ({ key, reason: "unsupported" as const }));
  }

  return result;
}

function sendToWindow(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Squirrel.Mac needs a real Developer ID signature before it will apply an
 * update, which this build doesn't have — so autoDownload stays off on
 * macOS and this fetches the dmg itself instead of the zip
 * autoUpdater.downloadUpdate() would target. The last step, opening it, is
 * left to the person: that's the part signing would actually gate.
 */
function downloadMacUpdate(info: UpdateInfo): void {
  if (macUpdateVersion === info.version) {
    return;
  }

  const url = pickDmgUrl(info.version, info.files);
  if (!url) {
    return; // a zip-only publish — nothing here for a person to open
  }

  macUpdateVersion = info.version;

  const destination = path.join(app.getPath("downloads"), path.basename(url));
  const request = net.request(url);

  request.on("response", (response) => {
    const file = createWriteStream(destination);

    file.on("error", () => {
      macUpdateVersion = null;
    });

    response.on("data", (chunk) => file.write(chunk));
    response.on("end", () => {
      file.end();
      sendToWindow(updateDownloadedChannel, { version: info.version, path: destination });
    });
  });

  request.on("error", () => {
    macUpdateVersion = null; // retried on the next hourly check
  });

  request.end();
}

// Always safe to call, dev included: without these listeners an unhandled
// "error" event from checkForUpdates() would take the whole process down,
// and the menu's manual check (see buildAppMenu) needs them even when the
// hourly background poll below is never started.
function registerUpdateListeners(): void {
  autoUpdater.autoDownload = process.platform === "win32";

  // A repo with no releases yet, or no network, both surface here.
  autoUpdater.on("error", () => {
    if (manualCheckPending) {
      manualCheckPending = false;
      sendToWindow(updateCheckFailedChannel);
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (manualCheckPending) {
      manualCheckPending = false;
      sendToWindow(updateNotAvailableChannel);
    }
  });

  autoUpdater.on("update-available", (info) => {
    manualCheckPending = false;

    if (process.platform === "darwin") {
      downloadMacUpdate(info);
    } else if (process.platform === "linux") {
      sendToWindow(updateAvailableChannel, info.version);
    }
  });

  // Windows only — autoDownload is only true there, so this never fires on
  // macOS or Linux.
  autoUpdater.on("update-downloaded", () => sendToWindow(updateRestartReadyChannel));
}

function checkForUpdatesManually(): void {
  manualCheckPending = true;
  void autoUpdater.checkForUpdates().catch(() => {});
}

function startUpdateChecks(): void {
  void autoUpdater.checkForUpdates().catch(() => {});
  // Mirrors update-electron-app's old interval.
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
}

/**
 * macOS only: in production, Windows and Linux windows have no menu bar at
 * all — mainWindow.setMenu(null) removes it in favour of the custom title
 * row, and that per-window override would hide any app-level menu set here
 * regardless. macOS's menu bar lives outside the window, so it's the one
 * place a native "Check for Updates" item is reachable without adding a
 * menu bar those platforms otherwise deliberately don't have.
 *
 * Built from Electron's own role shorthands rather than a hand-rolled
 * template, so Edit/View/Window keep every default (Cut/Copy/Paste,
 * reload, zoom, minimize…) exactly as they were before this menu existed —
 * only the app submenu is customized, to add the one new item.
 */
function buildAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: checkForUpdatesLabel(app.getLocale()), click: () => checkForUpdatesManually() },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ];

  return Menu.buildFromTemplate(template);
}

function localAddresses(): Set<string> {
  const found = new Set<string>();
  const interfaces = os.networkInterfaces();

  Object.keys(interfaces).forEach((name) => {
    (interfaces[name] || []).forEach((entry) => found.add(entry.address));
  });

  return found;
}

function publishServers(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      discoveryServersChannel,
      sortServers(Array.from(discovered.values()))
    );
  }
}

function startDiscovery(): void {
  bonjour = new Bonjour();
  browser = bonjour.find({ type: discoveryType, protocol: discoveryProtocol });

  browser.on("up", (service: DiscoveredService) => {
    const server = buildServer(service, localAddresses());

    if (server) {
      discovered.set(server.id, server);
      publishServers();
    }
  });

  browser.on("down", (service: DiscoveredService) => {
    const id = service && service.fqdn;

    if (id && discovered.delete(id)) {
      publishServers();
    }
  });

  // Not a one-shot lookup: a backend started after the app still turns up.
  discoveryTimer = setInterval(() => browser?.update(), discoveryQueryInterval);
}

function refreshDiscovery(): void {
  browser?.update();
}

function stopDiscovery(): void {
  if (discoveryTimer) {
    clearInterval(discoveryTimer);
    discoveryTimer = null;
  }

  if (browser) {
    browser.stop();
    browser = null;
  }

  if (bonjour) {
    bonjour.destroy();
    bonjour = null;
  }

  discovered = new Map();
}

function createWindow(): void {
  // Only covers the frames before the renderer paints; the renderer sends
  // the real colours from tokens.css as soon as it has stamped the palette.
  // nativeTheme is read, never written: setting themeSource would take the
  // app's "auto" mode away from the OS.
  const colors = defaultChromeColors(nativeTheme.shouldUseDarkColors);

  mainWindow = new BrowserWindow({
    width: isDev ? 1600 : 1280,
    height: 900,
    // The narrowest and shortest the layout is designed for: two columns of
    // cards at the smallest tier. See the tiers in src/styles/shell.css.
    minWidth: minWindowWidth,
    minHeight: 480,
    // Revealed on ready-to-show, after first paint, by which time
    // index.html's guard has already stamped the right palette. No flash.
    show: false,
    backgroundColor: colors.color,
    ...windowChromeFor(process.platform, colors, desktop),
    // Linux only. macOS and Windows take the app icon from the bundle
    // (resources/icon.icns, icon.ico); a Linux window has no bundle to read
    // one from, so the running window is handed it here. public/icon.png is
    // copied verbatim into build/, next to this file.
    ...(process.platform === "linux" ? { icon: path.join(__dirname, "icon.png") } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // ready-to-show never fires for a page that failed to load — the dev
  // server not being up yet, say — and the window would stay invisible.
  mainWindow.webContents.once("did-fail-load", () => mainWindow?.show());

  mainWindow.webContents.on("did-finish-load", () => {
    if (discovered.size > 0) {
      publishServers();
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.setMenu(null);
    mainWindow.loadURL(`file://${path.join(__dirname, "index.html")}`);
  }

  startDiscovery();

  // The renderer plays the sound, so on macOS hide instead of close while global keys are on.
  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && globalKeysEnabled && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    stopDiscovery();
    releaseGlobalShortcuts();
    globalKeysEnabled = false;
    mainWindow = null;
  });
}

ipcMain.on(discoveryRefreshChannel, () => refreshDiscovery());

ipcMain.on(openReleasePageChannel, () => shell.openExternal(releasePageUrl));

ipcMain.on(openUpdateChannel, (event, filePath: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }

  // The renderer is untrusted, but it can only ever echo back the path this
  // process handed it in updateDownloadedChannel in the first place.
  if (typeof filePath === "string" && filePath.startsWith(app.getPath("downloads"))) {
    shell.openPath(filePath);
  }
});

ipcMain.on(restartToUpdateChannel, (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }

  autoUpdater.quitAndInstall();
});

// The renderer's own overflow menu, on Windows and Linux — the same manual
// check the native macOS app menu triggers, since neither of those
// platforms has a window menu bar in this app's custom chrome.
ipcMain.on(checkForUpdatesChannel, (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }

  checkForUpdatesManually();
});

// The renderer reports its resolved --bg/--fg whenever the palette or mode
// changes. Windows' caption buttons are drawn by the OS and do not follow
// CSS; without this they stay on last launch's palette, and the first switch
// to a light theme leaves dark glyphs on a light bar. The GNOME header bar's
// overlay takes the same update.
ipcMain.on(chromeChannel, (event, colors: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }

  if (!isChromeColors(colors)) {
    return;
  }

  mainWindow.setBackgroundColor(colors.color);

  if (process.platform === "win32") {
    mainWindow.setTitleBarOverlay({ ...colors, height: titleBarHeight.win32 });
  } else if (process.platform === "linux" && desktop === "gnome") {
    mainWindow.setTitleBarOverlay({ ...colors, height: titleBarHeight.linux });
  }
});

ipcMain.handle(shortcutsSetChannel, (event, request: unknown): ShortcutResult => {
  const empty: ShortcutResult = { registered: [], failed: [] };

  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return empty;
  }

  if (!isShortcutRequest(request, process.platform)) {
    return empty;
  }

  releaseGlobalShortcuts();
  globalKeysEnabled = request.enabled;

  return request.enabled ? registerGlobalShortcuts(request.modifier, request.keys) : empty;
});

// Without the lock, a second launch would see every combo as in use.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("ready", () => {
  createWindow();
  registerUpdateListeners();

  if (process.platform === "darwin") {
    Menu.setApplicationMenu(buildAppMenu());
  }

  if (!isDev) {
    startUpdateChecks();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
});
