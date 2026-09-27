import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { CardSkeleton } from "./CardSkeleton";
import { DropZone } from "./DropZone";
import { EmptyState } from "./EmptyState";
import { OfflineBanner } from "./OfflineBanner";

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
