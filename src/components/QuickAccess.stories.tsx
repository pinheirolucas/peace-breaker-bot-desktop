import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { emptyPresence } from "../../electron/presence";
import type { PresenceSnapshot } from "../../electron/presence";
import type { Server } from "../../electron/discovery";
import type { Instant } from "../storage";
import type { Playback } from "./InstantCard";
import { MenuItem } from "./Menu";
import { PresenceStrip } from "./PresenceStrip";
import { QuickAccessConnection, QuickAccessFavorites } from "./QuickAccessViews";
import type { QuickAccessFavoritesProps } from "./QuickAccessViews";
import { ToastProvider } from "./Toast";

const meta: Meta = { title: "Quick access/Window" };
export default meta;

const noop = () => undefined;
const server = "http://192.168.0.5:9001/api/v1";
const inChannel = { connected: true, guildName: "Casa", channelName: "geral" };
const snapshot = (patch: Partial<PresenceSnapshot> = {}): PresenceSnapshot => ({
  ...emptyPresence,
  server,
  bot: inChannel,
  ...patch
});

const clips: Instant[] = [
  { name: "Vine boom", url: "https://x/1.mp3", key: "v" },
  { name: "Airhorn", url: "https://x/2.mp3" },
  { name: "Bruxaria", url: "https://x/3.mp3", key: "b" },
  { name: "Ai que delícia", url: "https://x/4.mp3" },
  { name: "Nossa senhora", url: "https://x/5.mp3" },
  { name: "Risada do Ronaldinho", url: "https://x/6.mp3" }
];

/** Quick access's window at true size, 360 x 520. */
function Panel({ state, height = 520, children }: { state: PresenceSnapshot; height?: number; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="app quick-access" style={{ width: 360, height, border: "1px solid var(--line)", overflow: "hidden" }}>
        <PresenceStrip snapshot={state} pinned={false} onStop={noop} onPin={noop} menu={<MenuItem primary="Abrir Peace Breaker Bot" />} />
        {children}
      </div>
    </ToastProvider>
  );
}

function Favorites({ state, ...props }: { state: PresenceSnapshot } & Partial<QuickAccessFavoritesProps>) {
  const [query, setQuery] = useState(props.query ?? "");
  const shown = query ? clips.filter(({ name }) => name.toLowerCase().includes(query.toLowerCase())) : clips;

  return (
    <Panel state={state}>
      <QuickAccessFavorites
        instants={props.instants ?? shown}
        total={props.total ?? clips.length}
        query={query}
        onQuery={setQuery}
        playbackOf={props.playbackOf ?? (() => "idle")}
        otherPlaying={props.otherPlaying ?? false}
        botStatus={state.bot}
        offline={state.silent}
        onRetry={noop}
        matchUrl={props.matchUrl ?? null}
        hint={props.hint ?? false}
        onPlay={noop}
        onOpenApp={noop}
      />
    </Panel>
  );
}

const many: Instant[] = Array.from({ length: 43 }, (_, i) => ({ name: `${clips[i % clips.length].name} ${i + 1}`, url: `https://x/many-${i}.mp3` }));

const row = { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" } as const;

/** Favoritos, the default style. Cards are the window's own components at the Tight tier's size. */
export const FavoritosDefault: StoryObj = { name: "Favoritos · idle, with the drag hint", render: () => <Favorites state={snapshot()} hint /> };

/** 43 favourites: only the grid scrolls. The strip, search, banner, hint and footer stay put. */
export const FavoritosLongList: StoryObj = {
  name: "Favoritos · 43 favorites, only the grid scrolls",
  render: () => <Favorites state={snapshot({ silent: true })} instants={many} total={many.length} hint />
};

/** Two favourites: the footer still sits at the bottom of the 520px window. */
export const FavoritosShortList: StoryObj = {
  name: "Favoritos · 2 favorites, footer at the bottom",
  render: () => <Favorites state={snapshot()} instants={clips.slice(0, 2)} total={2} />
};

export const FavoritosPlaying: StoryObj = {
  name: "Favoritos · playing",
  render: () => {
    const playing = snapshot({ playing: { mode: "local", name: "Airhorn", since: 1 } });
    const playbackOf = (instant: Instant): Playback => (instant.url === clips[1].url ? "local" : "idle");
    return <Favorites state={playing} playbackOf={playbackOf} otherPlaying />;
  }
};

export const FavoritosSearching: StoryObj = {
  name: "Favoritos · typed a name, first match armed",
  render: () => (
    <Favorites
      state={snapshot()}
      query="bru"
      instants={[clips[2]]}
      matchUrl={clips[2].url}
    />
  )
};

export const FavoritosBotAway: StoryObj = {
  name: "Favoritos · bot out of its channel",
  render: () => <Favorites state={snapshot({ bot: { connected: false } })} />
};

export const FavoritosSilent: StoryObj = {
  name: "Favoritos · server silent",
  render: () => <Favorites state={snapshot({ silent: true })} />
};

export const FavoritosEmpty: StoryObj = {
  name: "Favoritos · no favorites / no match",
  render: () => (
    <div style={row}>
      <Favorites state={snapshot()} instants={[]} total={0} />
      <Favorites state={snapshot()} instants={[]} query="zzz" />
    </div>
  )
};

// ---- Conexão ----

const servers: Server[] = [
  { id: "a", apiUrl: "http://192.168.0.5:9001/api/v1", address: "192.168.0.5", port: 9001, hostname: "mac.local", isLocal: true },
  { id: "b", apiUrl: "http://192.168.0.9:9001/api/v1", address: "192.168.0.9", port: 9001, hostname: "nas", isLocal: false },
  { id: "c", apiUrl: "http://192.168.0.12:9002/api/v1", address: "192.168.0.12", port: 9002, hostname: null, isLocal: false }
];

function Connection({
  state,
  height = 400,
  ...props
}: { state: PresenceSnapshot; height?: number } & Partial<React.ComponentProps<typeof QuickAccessConnection>>) {
  return (
    <Panel state={state} height={height}>
      <QuickAccessConnection
        servers={servers}
        activeUrl={server}
        healthy
        searching={false}
        onSelect={noop}
        onSearch={noop}
        onOpenApp={noop}
        {...props}
      />
    </Panel>
  );
}

/** Conexão: no sounds, only the server. The strip on top is identical to Favoritos. */
export const ConexaoList: StoryObj = { name: "Conexão · servers found", render: () => <Connection state={snapshot()} /> };

export const ConexaoSearching: StoryObj = {
  name: "Conexão · searching",
  render: () => <Connection state={snapshot()} searching />
};

export const ConexaoNothing: StoryObj = {
  name: "Conexão · nothing found",
  render: () => <Connection state={emptyPresence} servers={[]} activeUrl={null} height={300} />
};

export const ConexaoSilent: StoryObj = {
  name: "Conexão · active server silent, still listed first",
  render: () => (
    <Connection
      state={snapshot({ silent: true, bot: null })}
      servers={servers.slice(1)}
      activeUrl="http://10.0.0.7:9001/api/v1"
      healthy={false}
    />
  )
};

export const ConexaoBotAway: StoryObj = {
  name: "Conexão · bot out of its channel",
  render: () => <Connection state={snapshot({ bot: { connected: false } })} />
};
