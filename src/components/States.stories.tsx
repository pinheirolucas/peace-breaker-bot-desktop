import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { CardSkeleton } from "./CardSkeleton";
import { DropZone } from "./DropZone";
import { EmptyState } from "./EmptyState";
import { OfflineBanner } from "./OfflineBanner";
import { SyncStatusRow } from "../settings/DataSection";

const meta: Meta = { title: "Components/States" };
export default meta;

const grid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 } as const;

/** No screen without content ends on a sentence with no next step. */
export const FirstLaunch: StoryObj = {
  render: () => (
    <EmptyState
      title="Nenhum som ainda"
      body="Cole o link de um instant, ou vá ao MyInstants e favorite os que você usa toda hora."
      action={<Button>Adicionar um instant</Button>}
    />
  )
};

export const NoResults: StoryObj = {
  render: () => (
    <EmptyState
      title="Nada por aqui"
      body="Nenhum dos seus 12 favoritos bate com “xuxa”. No Explorar tem muito mais."
      action={<Button variant="secondary">Buscar “xuxa” no Explorar</Button>}
    />
  )
};

/** The card's exact footprint, so nothing jumps when the scrape returns. */
export const Loading: StoryObj = {
  render: () => (
    <div style={grid}>
      {[0, 1, 2].map((i) => <CardSkeleton key={i} index={i} />)}
    </div>
  )
};

export const ServerSilent: StoryObj = {
  render: () => (
    <div>
      <OfflineBanner address="localhost:9001" onSwitch={() => {}} />
      <div style={{ ...grid, opacity: 0.4 }}>
        {[0, 1, 2].map((i) => <CardSkeleton key={i} index={i} />)}
      </div>
    </div>
  )
};

export const DropZones: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 260px)", gap: 20 }}>
      <DropZone state="idle" title="" />
      <DropZone state="over" title="" />
      <DropZone state="ok" title="instants-2026-09-10.json" hint="34 instants no arquivo" />
      <DropZone state="bad" title="" />
    </div>
  )
};

const bot = "http://10.0.0.2:9001/api/v1";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

/** Configurações › Dados, one row per state. The dot is the state at a glance; the second line says what to do. */
export const FavoritesSync: StoryObj = {
  name: "Sincronização de favoritos",
  render: () => (
    <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
      <SyncStatusRow row={{ state: "synced", owner: "pinheirolucas", apiUrl: bot, updatedAt: minutesAgo(2) }} />
      <SyncStatusRow row={{ state: "waiting", count: 3, apiUrl: bot, offline: true }} />
      <SyncStatusRow row={{ state: "waiting", count: 1, apiUrl: bot, offline: false }} />
      <SyncStatusRow row={{ state: "unsupported", apiUrl: bot }} />
      <SyncStatusRow row={{ state: "stopped", label: "invalid_favorites", message: "That favorites list isn't valid" }} />
    </div>
  )
};

/** Text that could outgrow the row: a long owner and address, no save time yet, and a label this build doesn't know, which falls back to the bot's own message. */
export const FavoritesSyncEdges: StoryObj = {
  name: "Sincronização de favoritos · limites",
  render: () => (
    <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
      <SyncStatusRow
        row={{ state: "synced", owner: "um.dono.com.um.nome.bem.comprido", apiUrl: "http://studio-pc-do-lucas.local:19001/api/v1", updatedAt: minutesAgo(60 * 26) }}
      />
      <SyncStatusRow row={{ state: "synced", owner: "pinheirolucas", apiUrl: bot }} />
      <SyncStatusRow row={{ state: "stopped", label: "some_future_label", message: "The bot said no, in English" }} />
    </div>
  )
};
