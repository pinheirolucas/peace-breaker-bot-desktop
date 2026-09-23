import type { Meta, StoryObj } from "@storybook/react-vite";
import { defaultPresenceSettings } from "../../electron/presence";
import type { PresenceSettings } from "../../electron/presence";
import type { GlobalModifier } from "../../electron/shortcuts";
import PresenceDialog from "./PresenceDialog";

const meta: Meta = { title: "Quick access/Barra de menus dialog" };
export default meta;

const noop = () => undefined;

function Dialog({
  settings = {},
  os = "mac",
  noTray = false,
  shortcut = false,
  modifiers = ["ctrl-alt", "ctrl-shift", "cmd-alt"]
}: {
  settings?: Partial<PresenceSettings>;
  os?: "mac" | "win" | "linux";
  noTray?: boolean;
  shortcut?: boolean;
  modifiers?: GlobalModifier[];
}) {
  return (
    <PresenceDialog
      open
      onOpenChange={noop}
      os={os}
      noTray={noTray}
      settings={{ ...defaultPresenceSettings, ...settings }}
      shortcut={{ enabled: shortcut, modifier: null }}
      modifiers={modifiers}
      onConfirm={noop}
    />
  );
}

/** A fresh install: everything off, quick access disabled with its reason under it. */
export const Fresh: StoryObj = { render: () => <Dialog /> };

/** Icon and quick access on, the global shortcut still off: it is its own opt-in switch. */
export const QuickAccessOn: StoryObj = { render: () => <Dialog settings={{ tray: true, panel: true }} /> };

export const ShortcutOn: StoryObj = { render: () => <Dialog settings={{ tray: true, panel: true }} shortcut /> };

export const ConnectionStyle: StoryObj = {
  render: () => <Dialog settings={{ tray: true, panel: true, panelStyle: "connection" }} />
};

/** Off macOS the sound-name switch gives way to keeping the app running. Switch Sistema to Windows. */
export const Windows: StoryObj = {
  render: () => <Dialog os="win" settings={{ tray: true }} modifiers={["ctrl-alt-shift", "ctrl-shift", "ctrl-alt"]} />
};

/** GNOME has no tray: one line points to the dock action and the global shortcut. */
export const Gnome: StoryObj = {
  render: () => (
    <Dialog os="linux" noTray settings={{ tray: true, panel: true }} modifiers={["ctrl-alt-shift", "ctrl-shift", "super-alt"]} />
  )
};
