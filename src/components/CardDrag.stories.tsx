import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ClipDragState } from "../hooks/useClipDrag";
import InstantCard from "./InstantCard";

const meta: Meta = { title: "Components/Card · drag out" };
export default meta;

const noop = () => undefined;
const instant = { name: "Vine boom", url: "https://x/1.mp3" };

function Slot({ caption, state, organize }: { caption: string; state?: ClipDragState; organize?: boolean }) {
  return (
    <figure style={{ margin: 0, width: 240 }}>
      <InstantCard
        instant={instant}
        playback="idle"
        otherPlaying={false}
        botStatus={null}
        onPlay={noop}
        onPlayOnDiscord={noop}
        onStop={noop}
        dragState={state}
        organize={organize ? { position: 1, total: 6, onRename: noop } : undefined}
      />
      <figcaption style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>{caption}</figcaption>
    </figure>
  );
}

/** The whole card is the drag source after 6px; a press that travels less is a click. */
export const States: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
      <Slot caption="Rest." />
      <Slot caption="Pressed: scale .97. The file is already being prepared." state="pressed" />
      <Slot caption="Preparing: the pointer travelled before the file was ready." state="preparing" />
      <Slot caption="Dragging: the source stays, dashed and faded, while the OS carries the file." state="dragging" />
      <Slot caption="Unavailable: the file could not be prepared. A toast says so." state="unavailable" />
      <Slot caption="Organizar: the body drags to reorder, so there is no file drag." organize />
    </div>
  )
};
