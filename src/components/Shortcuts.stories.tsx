import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { MoreIcon, TrashIcon } from "../icons";
import type { Instant } from "../storage";
import InstantCard from "./InstantCard";
import { Menu, MenuItem } from "./Menu";
import { IconButton } from "./Button";
import ShortcutDialog from "./ShortcutDialog";
import ShortcutSheet from "./ShortcutSheet";

const meta: Meta = { title: "Components/Atalhos do teclado" };
export default meta;

const noop = () => undefined;
const base = {
  playback: "idle" as const,
  otherPlaying: false,
  botStatus: null,
  onPlay: noop,
  onPlayOnDiscord: noop,
  onStop: noop,
  trail: { label: "Remover", icon: <TrashIcon />, onClick: noop }
};

const clips: Instant[] = [
  { name: "Vish", url: "https://www.myinstants.com/pt/instant/clip-1/", key: "v" },
  { name: "Bruxaria", url: "https://www.myinstants.com/pt/instant/clip-2/", key: "b" },
  { name: "Tá chegando a hora", url: "https://www.myinstants.com/pt/instant/clip-3/", key: "1" },
  { name: "Cala a boca", url: "https://www.myinstants.com/pt/instant/clip-4/", key: "c" },
  { name: "Nossa senhora", url: "https://www.myinstants.com/pt/instant/clip-5/" },
  { name: "Tá tudo dominado", url: "https://www.myinstants.com/pt/instant/clip-6/" }
];

const row = { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" } as const;

function Slot({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure style={{ margin: 0, width: 240 }}>
      {children}
      <figcaption style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
        {caption}
      </figcaption>
    </figure>
  );
}

const organize = { position: 1, total: 6, onRename: noop, onSetKey: noop };

/** The keycap shares the top-right corner with the playing chip and the grip. */
export const CardKeycap: StoryObj = {
  name: "Card · keycap states",
  render: () => (
    <div style={row}>
      <Slot caption="At rest.">
        <InstantCard {...base} instant={clips[0]} />
      </Slot>
      <Slot caption="Key down: the pressed look, keycap inverted.">
        <InstantCard {...base} instant={clips[1]} shortcut={{ flash: "press" }} />
      </Slot>
      <Slot caption="Refused: the card shakes (not under reduced motion).">
        <InstantCard {...base} instant={clips[2]} shortcut={{ flash: "refuse" }} />
      </Slot>
      <Slot caption="Playing: the chip replaces the keycap.">
        <InstantCard {...base} instant={clips[0]} playback="discord" />
      </Slot>
      <Slot caption="Another clip is playing: dimmed, keycap included.">
        <InstantCard {...base} instant={clips[3]} otherPlaying />
      </Slot>
      <Slot caption="No key: nothing is drawn.">
        <InstantCard {...base} instant={clips[4]} />
      </Slot>
      <Slot caption="Organizar: keycap moves left of the grip; the footer gains the keyboard button.">
        <InstantCard {...base} instant={clips[3]} organize={organize} />
      </Slot>
      <Slot caption="Organizar, no key: a dashed slot.">
        <InstantCard {...base} instant={clips[5]} organize={organize} />
      </Slot>
    </div>
  )
};

function DialogStory({ instant, global }: { instant: Instant; global?: boolean }) {
  return (
    <ShortcutDialog
      instant={instant}
      instants={clips}
      global={
        global
          ? {
              combo: (key) => `Ctrl+Alt+Shift+${key.toUpperCase()}`,
              inUse: (key) => key === "c"
            }
          : undefined
      }
      onCancel={noop}
      onSave={noop}
    />
  );
}

export const DialogWaiting: StoryObj = {
  name: "Dialog · waiting",
  render: () => <DialogStory instant={clips[5]} />
};

export const DialogCaptured: StoryObj = {
  name: "Dialog · captured",
  render: () => <DialogStory instant={clips[0]} />
};

export const DialogTaken: StoryObj = {
  name: "Dialog · key already used by another sound",
  render: () => <DialogStory instant={{ ...clips[5], key: "b" }} />
};

/** Press Space or punctuation in the capture box to see the refusal. */
export const DialogRefusedInteractive: StoryObj = {
  name: "Dialog · refused (press Space)",
  render: () => <DialogStory instant={clips[5]} />
};

export const DialogGlobal: StoryObj = {
  name: "Dialog · global keys on",
  render: () => <DialogStory instant={clips[0]} global />
};

export const DialogGlobalInUse: StoryObj = {
  name: "Dialog · global combo in use",
  render: () => <DialogStory instant={clips[3]} global />
};

function withBridge(enabled: boolean) {
  window.instantsShortcuts = {
    modifiers: ["ctrl-alt-shift", "ctrl-shift", "super-alt"],
    setGlobal: async () => ({ registered: [], failed: [] }),
    onFired: () => noop
  };
  localStorage.setItem("globalShortcuts", JSON.stringify({ enabled, modifier: null }));
}

function withoutBridge() {
  delete window.instantsShortcuts;
}

/** The native menus' bridge. With it the sheet names each command's menu and lists the menu-only keys. */
function withMenuBar(present: boolean) {
  if (!present) {
    delete window.instantsMenu;
    return;
  }

  window.instantsMenu = {
    setState: noop,
    onCommand: () => noop,
    cardContext: noop,
    gridContext: noop,
    serverContext: noop,
    serverRowContext: noop,
    selectionContext: noop
  };
}

interface SheetStoryProps {
  /** Global keys: absent is a browser tab, false is off, true is on. */
  global?: boolean;
  menuBar?: boolean;
  failed?: string[];
  instants?: Instant[];
  os?: "mac" | "win" | "linux";
}

function SheetStory({ global, menuBar = true, failed = [], instants = clips, os = "win" }: SheetStoryProps) {
  if (global === undefined) withoutBridge();
  else withBridge(global);
  withMenuBar(menuBar);

  return (
    <ShortcutSheet
      open
      onOpenChange={noop}
      instants={instants}
      os={os}
      status={{
        registered: [],
        failed: failed.map((key) => ({ key, reason: "in-use" as const }))
      }}
      onOrganize={noop}
    />
  );
}

export const SheetInApp: StoryObj = {
  name: "Sheet · in the app (no bridge)",
  render: () => <SheetStory menuBar={false} />
};

export const SheetGlobalOff: StoryObj = {
  name: "Sheet · global keys off",
  render: () => <SheetStory global={false} />
};

export const SheetGlobalOn: StoryObj = {
  name: "Sheet · global keys on",
  render: () => <SheetStory global os="mac" />
};

export const SheetGlobalOnWindows: StoryObj = {
  name: "Sheet · global keys on (Windows)",
  render: () => <SheetStory global />
};

export const SheetConflict: StoryObj = {
  name: "Sheet · a combo another app holds",
  render: () => <SheetStory global failed={["c"]} os="mac" />
};

export const SheetNoKeyedSounds: StoryObj = {
  name: "Sheet · no sound has a key",
  render: () => <SheetStory global={false} instants={clips.map(({ key: _key, ...clip }) => clip)} />
};

export const SheetNoSounds: StoryObj = {
  name: "Sheet · no sounds at all",
  render: () => <SheetStory global={false} instants={[]} />
};

export const SheetNarrow: StoryObj = {
  name: "Sheet · narrow window (one column, menu names dropped)",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <SheetStory global os="mac" />
};

export const MenuEntry: StoryObj = {
  name: "Menu · item with its key",
  render: () => (
    <Menu
      open
      trigger={
        <IconButton label="Mais opções">
          <MoreIcon />
        </IconButton>
      }
    >
      <MenuItem primary="Aparência" />
      <MenuItem primary="Atalhos do teclado" hint="?" />
    </Menu>
  )
};
