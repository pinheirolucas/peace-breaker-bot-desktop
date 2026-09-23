// The menu behind the tray icon, and the same items on the Dock menu, the
// Windows Jump List and the Linux desktop entry. Pure: the actions are
// handed in, so this builds the same list on every platform and a test can
// read it without Electron. Inlined nowhere: main only.

import type { MenuItemConstructorOptions } from "electron";
import type { Translate } from "./menuI18n";
import { statusLine } from "./presence";
import type { PresenceSnapshot } from "./presence";

export type TrayAction = "stop" | "open-quick-access" | "open-app" | "refresh";

/** The `--action=` values a second launch (Jump List, desktop entry) may carry. */
const actionArg = /^--action=(stop|open-quick-access|open-panel|open-app|refresh)$/;

export function actionFromArgv(argv: readonly string[]): TrayAction | null {
  for (const arg of argv) {
    const match = actionArg.exec(arg);
    // open-panel is what a Jump List or desktop entry written before the rename still launches with.
    if (match) return match[1] === "open-panel" ? "open-quick-access" : (match[1] as TrayAction);
  }
  return null;
}

export interface TrayMenuOptions {
  /** "Abrir acesso rápido" appears only when quick access is on. */
  panel: boolean;
  /** The Dock menu already has Quit of its own. */
  quit: boolean;
}

export type TrayHandlers = Record<TrayAction | "quit", () => void>;

export function trayMenu(
  snapshot: PresenceSnapshot,
  options: TrayMenuOptions,
  t: Translate,
  on: TrayHandlers
): MenuItemConstructorOptions[] {
  // Opening comes first, then what acts on playback and the server.
  const items: MenuItemConstructorOptions[] = [
    { label: statusLine(snapshot, t), enabled: false },
    { type: "separator" },
    { label: t("presence.openApp"), click: on["open-app"] }
  ];

  if (options.panel) {
    items.push({ label: t("presence.openQuickAccess"), click: on["open-quick-access"] });
  }

  items.push(
    { type: "separator" },
    { label: t("presence.stop"), enabled: snapshot.playing !== null, click: on.stop },
    { label: t("presence.refresh"), click: on.refresh }
  );

  if (options.quit) {
    items.push({ type: "separator" }, { label: t("presence.quit"), click: on.quit });
  }

  return items;
}

export interface JumpListTask {
  title: string;
  description: string;
  arguments: string;
}

/** Windows Jump List tasks: a click launches the exe again with `--action=`, which the running instance receives. */
export function jumpListTasks(snapshot: PresenceSnapshot, panel: boolean, t: Translate): JumpListTask[] {
  const task = (action: TrayAction, label: string): JumpListTask => ({
    title: label,
    description: label,
    arguments: `--action=${action}`
  });

  return [
    ...(panel ? [task("open-quick-access", t("presence.openQuickAccess"))] : []),
    ...(snapshot.playing ? [task("stop", t("presence.stop"))] : []),
    task("refresh", t("presence.refresh"))
  ];
}
