// The menu behind the tray icon, and the same items on the Dock menu, the
// Windows Jump List and the Linux desktop entry. Pure: the actions are
// handed in, so this builds the same list on every platform and a test can
// read it without Electron. Inlined nowhere: main only.

import type { MenuItemConstructorOptions } from "electron";
import type { Translate } from "./menuI18n";
import type { PresenceSnapshot } from "./presence";

export type TrayAction = "stop" | "open-panel" | "open-app" | "refresh";

/** The `--action=` values a second launch (Jump List, desktop entry) may carry. */
const actionArg = /^--action=(stop|open-panel|open-app|refresh)$/;

export function actionFromArgv(argv: readonly string[]): TrayAction | null {
  for (const arg of argv) {
    const match = actionArg.exec(arg);
    if (match) return match[1] as TrayAction;
  }
  return null;
}

/** One line for the top of every menu: what the app is doing, in the order that matters. */
export function statusLine(snapshot: PresenceSnapshot, t: Translate): string {
  if (snapshot.server === null) return t("server.none");
  if (snapshot.playing) return t("presence.playing", { name: snapshot.playing.name });
  if (snapshot.bot === null) return t("presence.checking");
  if (!snapshot.bot.connected) return t("server.notInVoice");

  const { guildName, channelName } = snapshot.bot;
  return guildName && channelName
    ? t("server.inVoice", { guildName, channelName })
    : t("presence.connected");
}

export interface TrayMenuOptions {
  /** "Abrir painel" appears only when the panel is on. */
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
  const items: MenuItemConstructorOptions[] = [
    { label: statusLine(snapshot, t), enabled: false },
    { type: "separator" },
    { label: t("presence.stop"), enabled: snapshot.playing !== null, click: on.stop }
  ];

  if (options.panel) {
    items.push({ label: t("presence.openPanel"), click: on["open-panel"] });
  }

  items.push(
    { label: t("presence.openApp"), click: on["open-app"] },
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
    ...(panel ? [task("open-panel", t("presence.openPanel"))] : []),
    ...(snapshot.playing ? [task("stop", t("presence.stop"))] : []),
    task("refresh", t("presence.refresh"))
  ];
}
