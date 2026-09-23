// The main process's side of presence: the one PresenceStore, the single
// /bot/status poll, and every native surface that is a view of it (tray glyph,
// its menu, the Dock menu, the Windows Jump List). The decisions are pure and
// tested elsewhere (presence.ts, trayMenu.ts); this is the wiring to Electron.

import { app, Menu, nativeImage, nativeTheme, net, Tray } from "electron";
import type { Rectangle } from "electron";
import path from "node:path";
import { menuCommandChannel } from "./menuState";
import type { MenuLanguage } from "./menuState";
import { translatorFor } from "./menuI18n";
import {
  botFrom,
  defaultPresenceSettings,
  effectiveSettings,
  emptyPresence,
  mergePlaying,
  presenceReduce,
  presenceSnapshotChannel,
  trayState,
  trayTitle
} from "./presence";
import type { PlayingReport, PresenceAction, PresenceSettings, PresenceSnapshot } from "./presence";
import { jumpListTasks, statusLine, trayMenu } from "./trayMenu";
import type { TrayAction } from "./trayMenu";

/** How often the bot's voice-connection status is asked for, once for the whole app. */
export const pollMs = 8000;
const pollTimeoutMs = 5000;

export interface PresenceHostDeps {
  /** The folder the tray PNGs are in (build/tray). */
  iconDir: string;
  language: () => MenuLanguage;
  /** Sends to every renderer window, the panel included. */
  sendAll: (channel: string, payload?: unknown) => void;
  openApp: () => void;
  /** Toggles the quick panel, anchored to the tray icon. Absent until the panel exists. */
  togglePanel?: (trayBounds: Rectangle) => void;
  openPanel?: () => void;
  refreshDiscovery: () => void;
  quit: () => void;
}

export function createPresenceHost(deps: PresenceHostDeps) {
  let snapshot: PresenceSnapshot = emptyPresence;
  let settings: PresenceSettings = defaultPresenceSettings;
  const reports = new Map<number, PlayingReport | null>();
  let tray: Tray | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let pollGeneration = 0;

  const listeners = new Set<(snapshot: PresenceSnapshot) => void>();

  function dispatch(action: PresenceAction): void {
    const next = presenceReduce(snapshot, action);
    if (next === snapshot) return;

    const serverChanged = next.server !== snapshot.server;
    snapshot = next;

    if (serverChanged) restartPolling();
    render();
    deps.sendAll(presenceSnapshotChannel, snapshot);
    listeners.forEach((listener) => listener(snapshot));
  }

  // ---- the one /bot/status poll ----

  async function tick(generation: number): Promise<void> {
    const server = snapshot.server;
    if (!server) return;

    let bot = null;
    try {
      const response = await net.fetch(`${server}/bot/status`, {
        signal: AbortSignal.timeout(pollTimeoutMs)
      });
      const body = (await response.json()) as { data?: unknown };
      bot = botFrom(body.data);
    } catch {
      // unreachable, or an old backend with no route: unknown, never "not connected"
    }

    // A server picked meanwhile makes this answer stale.
    if (generation === pollGeneration) dispatch({ type: "bot", bot });
  }

  function restartPolling(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    pollGeneration += 1;

    if (!snapshot.server) return;

    const generation = pollGeneration;
    void tick(generation);
    pollTimer = setInterval(() => void tick(generation), pollMs);
  }

  // ---- what renderers report ----

  function setServer(server: string | null): void {
    dispatch({ type: "server", server });
  }

  function setPlaying(senderId: number, report: PlayingReport | null): void {
    reports.set(senderId, report);
    dispatch({ type: "playing", playing: mergePlaying(reports.values(), snapshot.playing, Date.now()) });
  }

  /** A renderer is gone, and whatever it was playing with it. */
  function forget(senderId: number): void {
    if (reports.delete(senderId)) {
      dispatch({ type: "playing", playing: mergePlaying(reports.values(), snapshot.playing, Date.now()) });
    }
  }

  function setSettings(next: PresenceSettings): void {
    settings = next;
    render();
  }

  // ---- stop, from any surface ----

  /** The endpoint from here, so it works with no window; the renderers stop their local players. */
  function stop(): void {
    const { playing, server } = snapshot;

    if (playing?.mode === "discord" && server) {
      void net.fetch(`${server}/bot/stop`, { method: "POST" }).catch(() => {});
    }

    deps.sendAll(menuCommandChannel, { type: "stop" });
  }

  // ---- views ----

  const handlers = (): Record<TrayAction | "quit", () => void> => ({
    stop,
    "open-panel": () => deps.openPanel?.(),
    "open-app": deps.openApp,
    refresh: deps.refreshDiscovery,
    quit: deps.quit
  });

  function menuFor(quit: boolean): Menu {
    const { panel } = effectiveSettings(settings);
    return Menu.buildFromTemplate(
      trayMenu(snapshot, { panel: panel && Boolean(deps.openPanel), quit }, translatorFor(deps.language()), handlers())
    );
  }

  function iconFor(): Electron.NativeImage {
    const state = trayState(snapshot);

    // macOS tints a Template image itself, so one black cut serves both modes;
    // the others draw the file as it is: white ink on a dark tray, black on a light one.
    const file =
      process.platform === "darwin"
        ? `${state}Template.png`
        : `${state}-${nativeTheme.shouldUseDarkColors ? "light" : "dark"}.png`;

    return nativeImage.createFromPath(path.join(deps.iconDir, file));
  }

  function renderTray(): void {
    const { tray: wanted } = effectiveSettings(settings);

    if (!wanted) {
      tray?.destroy();
      tray = null;
      return;
    }

    if (!tray) {
      tray = new Tray(iconFor());

      // Not setContextMenu: on macOS that swallows click and double-click,
      // and the click is the panel's. Linux delivers no click at all, so it
      // is the one place the menu is attached.
      if (process.platform !== "linux") {
        tray.on("click", (_event, bounds) => {
          if (effectiveSettings(settings).panel && deps.togglePanel) {
            deps.togglePanel(bounds);
          } else {
            tray?.popUpContextMenu(menuFor(true));
          }
        });
        tray.on("right-click", () => tray?.popUpContextMenu(menuFor(true)));
        // No event on Linux; there "Abrir Peace Breaker Bot" in the menu is the equal.
        tray.on("double-click", () => deps.openApp());
      }
    }

    tray.setImage(iconFor());
    tray.setToolTip(statusLine(snapshot, translatorFor(deps.language())));

    if (process.platform === "darwin") {
      tray.setTitle(trayTitle(snapshot, effectiveSettings(settings)));
    }
    if (process.platform === "linux") {
      tray.setContextMenu(menuFor(true));
    }
  }

  function renderShortcuts(): void {
    // The Dock menu and Jump List do not depend on the tray icon: they are
    // the same items, wherever the app already has a place for them.
    if (process.platform === "darwin") {
      app.dock?.setMenu(menuFor(false));
    }

    if (process.platform === "win32") {
      const { panel } = effectiveSettings(settings);
      const t = translatorFor(deps.language());

      app.setUserTasks(
        jumpListTasks(snapshot, panel && Boolean(deps.openPanel), t).map((task) => ({
          program: process.execPath,
          arguments: task.arguments,
          iconPath: process.execPath,
          iconIndex: 0,
          title: task.title,
          description: task.description
        }))
      );
    }
  }

  function render(): void {
    renderTray();
    renderShortcuts();
  }

  nativeTheme.on("updated", () => tray?.setImage(iconFor()));

  function run(action: TrayAction): void {
    handlers()[action]();
  }

  function destroy(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    tray?.destroy();
    tray = null;
  }

  return {
    snapshot: () => snapshot,
    settings: () => effectiveSettings(settings),
    setServer,
    setPlaying,
    forget,
    setSettings,
    stop,
    run,
    /** Rebuilds every view: the language changed. */
    render,
    destroy,
    onChange: (listener: (snapshot: PresenceSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export type PresenceHost = ReturnType<typeof createPresenceHost>;
