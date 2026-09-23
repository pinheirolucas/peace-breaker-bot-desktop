import { contextBridge, ipcRenderer } from "electron";
import { discoveryRefreshChannel, discoveryServersChannel } from "./discovery";
import type { Server } from "./discovery";
import { clipDragChannel, clipDragEndChannel, clipPrepareChannel } from "./clip";
import { quickAccessActionChannel, quickAccessShortcutSetChannel, quickAccessShownChannel } from "./quickAccess";
import type { QuickAccessAction, QuickAccessShortcutRequest } from "./quickAccess";
import type { ClipDragResult, ClipPrepareResult, ClipRequest } from "./clip";
import {
  isPresenceSnapshot,
  presencePlayingChannel,
  presenceServerChannel,
  presenceSettingsChannel,
  presenceSnapshotChannel,
  presenceStopChannel
} from "./presence";
import type { PlayingReport, PresenceSettings, PresenceSnapshot } from "./presence";
import { chromeChannel, chromeKind, desktopFor } from "./chrome";
import type { ChromeColors } from "./chrome";
import {
  cardContextChannel,
  gridContextChannel,
  isMenuCommand,
  menuCommandChannel,
  menuStateChannel,
  selectionContextChannel,
  serverContextChannel,
  serverRowContextChannel
} from "./menuState";
import type { CardContext, MenuCommand, MenuState } from "./menuState";
import {
  modifiersFor,
  shortcutsFiredChannel,
  shortcutsSetChannel
} from "./shortcuts";
import type { ShortcutRequest, ShortcutResult } from "./shortcuts";
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

contextBridge.exposeInMainWorld("instantsShortcuts", {
  modifiers: modifiersFor(process.platform),
  setGlobal: (request: ShortcutRequest): Promise<ShortcutResult> =>
    ipcRenderer.invoke(shortcutsSetChannel, request),
  onFired: (listener: (key: string) => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = (_event: unknown, key: unknown) => {
      if (typeof key === "string") {
        listener(key);
      }
    };

    ipcRenderer.on(shortcutsFiredChannel, handler);
    return () => ipcRenderer.removeListener(shortcutsFiredChannel, handler);
  }
});

// The native menus. State goes up, commands come down; the popups themselves
// are built in the main process, which validates everything sent here again.
contextBridge.exposeInMainWorld("instantsMenu", {
  setState: (state: MenuState) => ipcRenderer.send(menuStateChannel, state),
  onCommand: (listener: (command: MenuCommand) => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = (_event: unknown, command: unknown) => {
      if (isMenuCommand(command)) {
        listener(command);
      }
    };

    ipcRenderer.on(menuCommandChannel, handler);
    return () => ipcRenderer.removeListener(menuCommandChannel, handler);
  },
  cardContext: (context: CardContext) => ipcRenderer.send(cardContextChannel, context),
  gridContext: () => ipcRenderer.send(gridContextChannel),
  serverContext: () => ipcRenderer.send(serverContextChannel),
  serverRowContext: (id: string) => ipcRenderer.send(serverRowContextChannel, { id }),
  selectionContext: () => ipcRenderer.send(selectionContextChannel)
});

// Dragging a clip out as a file. Main validates every request again and owns
// the file; the renderer only ever names a clip, never a path.
contextBridge.exposeInMainWorld("instantsClip", {
  prepare: (request: ClipRequest): Promise<ClipPrepareResult> =>
    ipcRenderer.invoke(clipPrepareChannel, request),
  drag: (request: ClipRequest): Promise<ClipDragResult> =>
    ipcRenderer.invoke(clipDragChannel, request),
  // The pointer is back: the OS drag is over, and quick access may hide again.
  dragEnd: () => ipcRenderer.send(clipDragEndChannel)
});

// The quick access: what it asks of main, and its own global shortcut. Main
// checks the sender for every action; the shortcut request is validated too.
contextBridge.exposeInMainWorld("instantsQuickAccess", {
  action: (action: QuickAccessAction) => ipcRenderer.send(quickAccessActionChannel, action),
  setShortcut: (request: QuickAccessShortcutRequest): Promise<ShortcutResult> =>
    ipcRenderer.invoke(quickAccessShortcutSetChannel, request),
  onShown: (listener: () => void) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handler = () => listener();

    ipcRenderer.on(quickAccessShownChannel, handler);
    return () => ipcRenderer.removeListener(quickAccessShownChannel, handler);
  }
});

// What main needs from the renderer to act without a window, and the one
// record it answers with. Main validates every report again.
type SnapshotListener = (snapshot: PresenceSnapshot) => void;

const snapshotListeners = new Set<SnapshotListener>();
let lastSnapshot: PresenceSnapshot | null = null;

ipcRenderer.on(presenceSnapshotChannel, (_event, snapshot: unknown) => {
  if (!isPresenceSnapshot(snapshot)) return;

  lastSnapshot = snapshot;
  snapshotListeners.forEach((listener) => listener(snapshot));
});

contextBridge.exposeInMainWorld("instantsPresence", {
  setServer: (url: string | null) => ipcRenderer.send(presenceServerChannel, url),
  setPlaying: (report: PlayingReport | null) => ipcRenderer.send(presencePlayingChannel, report),
  setSettings: (settings: PresenceSettings) => ipcRenderer.send(presenceSettingsChannel, settings),
  stop: () => ipcRenderer.send(presenceStopChannel),
  // Replays the last snapshot to a late subscriber, like instantsDiscovery.
  onSnapshot: (listener: SnapshotListener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    snapshotListeners.add(listener);
    if (lastSnapshot) listener(lastSnapshot);

    return () => {
      snapshotListeners.delete(listener);
    };
  }
});
