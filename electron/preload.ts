import { contextBridge, ipcRenderer } from "electron";
import { discoveryRefreshChannel, discoveryServersChannel } from "./discovery";
import type { Server } from "./discovery";
import { chromeChannel, chromeKind, desktopFor } from "./chrome";
import type { ChromeColors } from "./chrome";
import {
  checkForUpdatesChannel,
  openReleasePageChannel,
  openUpdateChannel,
  restartToUpdateChannel,
  updateAvailableChannel,
  updateCheckFailedChannel,
  updateDownloadedChannel,
  updateNotAvailableChannel,
  updateRestartReadyChannel
} from "./updates";

// The preload runs sandboxed, so it cannot require a sibling module at
// runtime — which is why these channel names used to be spelled out here
// a second time. tsup inlines ./discovery at build time, so there is now
// exactly one definition and no runtime require.

type ServersListener = (servers: Server[]) => void;

const listeners = new Set<ServersListener>();
let lastServers: Server[] = [];

ipcRenderer.on(discoveryServersChannel, (_event, servers: unknown) => {
  lastServers = Array.isArray(servers) ? (servers as Server[]) : [];
  listeners.forEach((listener) => listener(lastServers));
});

contextBridge.exposeInMainWorld("instantsDiscovery", {
  onServers: (listener: ServersListener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    listeners.add(listener);

    // A late subscriber still gets the list that arrived before it mounted.
    if (lastServers.length > 0) {
      listener(lastServers);
    }

    return () => {
      listeners.delete(listener);
    };
  },
  refresh: () => ipcRenderer.send(discoveryRefreshChannel)
});

// The renderer has no `process` under contextIsolation, and the plain web
// build has no bridge at all — so the OS answer has to come across here,
// synchronously, before any app script runs. index.html's guard reads it.
const os =
  process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";

interface DownloadedPayload {
  version: string;
  path: string;
}

function isDownloadedPayload(value: unknown): value is DownloadedPayload {
  const payload = value as Partial<DownloadedPayload> | null;
  return (
    !!payload && typeof payload.version === "string" && typeof payload.path === "string"
  );
}

// One listener per subscription, unlike instantsDiscovery's shared set: each
// event here fires at most once per update, so there is no cached "last
// value" worth replaying to a late subscriber.
contextBridge.exposeInMainWorld("instantsUpdates", {
  onAvailable: (listener: (version: string) => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = (_event: unknown, version: unknown) => {
      if (typeof version === "string") {
        listener(version);
      }
    };

    ipcRenderer.on(updateAvailableChannel, handler);
    return () => ipcRenderer.removeListener(updateAvailableChannel, handler);
  },
  onDownloaded: (listener: (info: DownloadedPayload) => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = (_event: unknown, payload: unknown) => {
      if (isDownloadedPayload(payload)) {
        listener(payload);
      }
    };

    ipcRenderer.on(updateDownloadedChannel, handler);
    return () => ipcRenderer.removeListener(updateDownloadedChannel, handler);
  },
  onRestartReady: (listener: () => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = () => listener();

    ipcRenderer.on(updateRestartReadyChannel, handler);
    return () => ipcRenderer.removeListener(updateRestartReadyChannel, handler);
  },
  // Both sent only in answer to a manual check — the native macOS app menu
  // or the app's own overflow menu on Windows/Linux — never by the hourly
  // background one.
  onNotAvailable: (listener: () => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = () => listener();

    ipcRenderer.on(updateNotAvailableChannel, handler);
    return () => ipcRenderer.removeListener(updateNotAvailableChannel, handler);
  },
  onCheckFailed: (listener: () => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = () => listener();

    ipcRenderer.on(updateCheckFailedChannel, handler);
    return () => ipcRenderer.removeListener(updateCheckFailedChannel, handler);
  },
  openReleasePage: () => ipcRenderer.send(openReleasePageChannel),
  openUpdate: (filePath: string) => ipcRenderer.send(openUpdateChannel, filePath),
  restart: () => ipcRenderer.send(restartToUpdateChannel),
  // Windows/Linux: triggered from the app's own overflow menu, in place of
  // the native item macOS gets in its app menu.
  checkNow: () => ipcRenderer.send(checkForUpdatesChannel)
});

// Linux only. GNOME gets the app's own header bar; KDE Plasma and the rest
// keep the window manager's title bar and the toolbar sits under it.
const desktop = desktopFor(process.platform, process.env.XDG_CURRENT_DESKTOP);

contextBridge.exposeInMainWorld("instantsPlatform", {
  os,
  desktop,
  // Whether the window is merged into the OS title bar, so the renderer
  // lays its toolbar out as the title bar itself. Read synchronously by
  // index.html's guard.
  chrome: chromeKind(process.platform, desktop),
  // Validated again in the main process; the renderer is not trusted.
  setChrome: (colors: ChromeColors) => ipcRenderer.send(chromeChannel, colors)
});
