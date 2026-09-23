import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { emptyPresence } from "../../electron/presence";
import type { PresenceSnapshot } from "../../electron/presence";
import { MenuItem, MenuSeparator } from "./Menu";
import { PresenceStrip } from "./PresenceStrip";

const meta: Meta = { title: "Quick access/Presence strip" };
export default meta;

const server = "http://192.168.0.5:9001/api/v1";
const inChannel = { connected: true, guildName: "Casa", channelName: "geral" };
const state = (patch: Partial<PresenceSnapshot>): PresenceSnapshot => ({ ...emptyPresence, server, ...patch });

const noop = () => undefined;
const menu = (
  <>
    <MenuItem primary="Abrir Peace Breaker Bot" />
    <MenuItem primary="Procurar servidor novamente" />
    <MenuSeparator />
    <MenuItem primary="Barra de menus" />
  </>
);

/** 360px, quick access's own width, so the strip resolves the size it really has. */
function Frame({ snapshot, pinned = false }: { snapshot: PresenceSnapshot; pinned?: boolean }) {
  const [on, setOn] = useState(pinned);

  return (
    <div className="app panel" style={{ width: 360, height: 56, border: "1px solid var(--line)" }}>
      <PresenceStrip snapshot={snapshot} pinned={on} onStop={noop} onPin={() => setOn(!on)} menu={menu} />
    </div>
  );
}

const column = { display: "flex", flexDirection: "column", gap: 16 } as const;

/** Fixed 56px, identical in every state. Stop is never absent, only disabled, so
 *  nothing shifts under a pointer that is mid-call. Green, amber and red are the
 *  window's own server chip colours; unknown is grey and never reads as "out of channel". */
export const States: StoryObj = {
  render: () => (
    <div style={column}>
      <Frame snapshot={state({ bot: inChannel })} />
      <Frame snapshot={state({ bot: { connected: false } })} />
      <Frame snapshot={state({ bot: inChannel, playing: { mode: "discord", name: "Vine boom", since: 1 } })} />
      <Frame snapshot={state({ silent: true })} />
      <Frame snapshot={state({ bot: null })} />
      <Frame snapshot={emptyPresence} />
    </div>
  )
};

export const Pinned: StoryObj = { render: () => <Frame snapshot={state({ bot: inChannel })} pinned /> };
