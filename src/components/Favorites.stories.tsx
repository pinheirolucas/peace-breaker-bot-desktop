import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import AddMenu from "../AddMenu";
import RenameForm from "../RenameForm";
import { TrashIcon } from "../icons";
import type { Instant } from "../storage";
import { Button } from "./Button";
import InstantCard from "./InstantCard";
import SortableInstantCard from "./SortableInstantCard";
import { TooltipProvider } from "./Tooltip";

const meta: Meta = { title: "Components/Favoritos · Organizar" };
export default meta;

const noop = () => undefined;
const trail = { label: "Remover", icon: <TrashIcon />, onClick: noop };
const base = {
  playback: "idle" as const,
  otherPlaying: false,
  botStatus: null,
  onPlay: noop,
  onPlayOnDiscord: noop,
  onStop: noop,
  trail
};

const clips: Instant[] = [
  "Tá chegando a hora",
  "Vish",
  "Nossa senhora",
  "Que isso rapaz",
  "Bruxaria",
  "Tá tudo dominado",
  "Risada do Ronaldinho",
  "Ai que delícia"
].map((name, i) => ({ name, url: `https://www.myinstants.com/pt/instant/clip-${i}/` }));

const cardWidth = 240;
const row = { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" } as const;

function Slot({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure style={{ margin: 0, width: cardWidth }}>
      {children}
      <figcaption style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
        {caption}
      </figcaption>
    </figure>
  );
}

/** Today's card next to the Organizar states: the body drags instead of
 *  playing, send and stop give way to rename, and the grip is decoration. */
export const CardStates: StoryObj = {
  name: "Card · play vs Organizar",
  render: () => (
    <div style={row}>
      <Slot caption="Play mode. Click plays.">
        <InstantCard {...base} instant={clips[1]} />
      </Slot>
      <Slot caption="Organizar, at rest. Grip at half strength, grab cursor.">
        <InstantCard
          {...base}
          instant={clips[1]}
          organize={{ position: 2, total: 8, onRename: noop }}
        />
      </Slot>
      <Slot caption="Lifted: the copy that follows the pointer, with its position.">
        <div style={{ padding: 12 }}>
          <InstantCard
            {...base}
            instant={clips[4]}
            organize={{ position: 4, total: 8, onRename: noop, drag: "overlay" }}
          />
        </div>
      </Slot>
      <Slot caption="The slot it came from, and lands in.">
        <InstantCard
          {...base}
          instant={clips[4]}
          organize={{ position: 5, total: 8, onRename: noop, drag: "ghost" }}
        />
      </Slot>
    </div>
  )
};

/** The real thing: drag a card, or Tab to one, press Space, use the arrow
 *  keys, press Space again. Esc while lifted cancels. */
export const SortableGrid: StoryObj = {
  name: "Sortable grid (interactive)",
  render: function Render() {
    const [items, setItems] = useState(clips);
    const [activeUrl, setActiveUrl] = useState<string | null>(null);
    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragEnd({ active, over }: DragEndEvent) {
      setActiveUrl(null);
      if (!over || active.id === over.id) return;

      setItems((current) =>
        arrayMove(
          current,
          current.findIndex(({ url }) => url === active.id),
          current.findIndex(({ url }) => url === over.id)
        )
      );
    }

    const active = items.find(({ url }) => url === activeUrl);

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveUrl(String(active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveUrl(null)}
      >
        <SortableContext items={items.map(({ url }) => url)} strategy={rectSortingStrategy}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 16,
              maxWidth: 1100
            }}
          >
            {items.map((instant, index) => (
              <SortableInstantCard
                key={instant.url}
                {...base}
                instant={instant}
                organize={{ position: index + 1, total: items.length, onRename: noop }}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {active && (
            <InstantCard
              {...base}
              instant={active}
              organize={{
                position: items.findIndex(({ url }) => url === active.url) + 1,
                total: items.length,
                onRename: noop,
                drag: "overlay"
              }}
            />
          )}
        </DragOverlay>
      </DndContext>
    );
  }
};

/** Adicionar is a split button: the plus adds, the arrow opens Organizar,
 *  Importar and Exportar. Organizar is disabled, with the reason under it,
 *  while a clip plays or a search is set; with no favourites it is left out.
 *  Concluir takes the split button's place while the mode is on. */
export const AddMenuStory: StoryObj = {
  name: "Toolbar · Adicionar",
  render: () => (
    <TooltipProvider>
      <div style={{ display: "grid", gap: 20, justifyItems: "start" }}>
        <div style={row}>
          <AddMenu
            onAdd={noop}
            onOrganize={noop}
            onImport={noop}
            onExport={noop}
            canOrganize
            organizeBlockedReason={null}
            shortcut="⌘N"
          />
        </div>
        <div style={row}>
          <AddMenu
            onAdd={noop}
            onOrganize={noop}
            onImport={noop}
            onExport={noop}
            canOrganize
            organizeBlockedReason="Pare o som para organizar"
          />
        </div>
        <div style={row}>
          <AddMenu
            onAdd={noop}
            onOrganize={noop}
            onImport={noop}
            onExport={noop}
            canOrganize={false}
            organizeBlockedReason={null}
          />
        </div>
        <div style={row}>
          <Button>Concluir</Button>
        </div>
      </div>
    </TooltipProvider>
  )
};

/** Opens on the current name, selected. Salvar stays dead until the name is
 *  valid (3+ characters) and different. The preview is the real card, inert,
 *  at its grid width (288px here), with the link under it. */
export const RenameDialog: StoryObj = {
  name: "Dialog · Renomear",
  render: () => <RenameForm instant={clips[4]} cardWidth={288} onCancel={noop} onSave={noop} />
};

/** Too short to save: Salvar is dead. Type to see the field's own message. */
export const RenameTooShort: StoryObj = {
  name: "Dialog · Renomear, too short",
  render: () => <RenameForm instant={{ ...clips[1], name: "Vi" }} cardWidth={288} onCancel={noop} onSave={noop} />
};

/** A long name is a warning, not an error: it saves, and the card clips it
 *  at two lines with an ellipsis. */
export const RenameLong: StoryObj = {
  name: "Dialog · Renomear, long name",
  render: () => (
    <RenameForm
      instant={{ ...clips[4], name: "Bruxaria da vovó que assusta o servidor inteiro" }}
      cardWidth={288}
      onCancel={noop}
      onSave={noop}
    />
  )
};
