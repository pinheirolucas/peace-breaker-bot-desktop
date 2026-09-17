import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { findShortcutLabel } from "../hooks/usePlatform";
import { MoreIcon, PlusIcon } from "../icons";
import { Button, IconButton } from "./Button";
import { Field } from "./Field";
import { RadioGroup } from "./Radio";
import { SearchField } from "./SearchField";
import { Segmented, SegmentedRoot } from "./Segmented";
import { ServerChip } from "./ServerChip";
import { Switch } from "./Switch";

const meta: Meta = { title: "Components/Controls" };
export default meta;

const row = { display: "flex", flexWrap: "wrap", gap: "22px 24px", alignItems: "flex-end" } as const;
const cap = { fontSize: 10.5, fontWeight: 600, color: "var(--muted)", marginTop: 9 } as const;

function Unit({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {children}
      <div style={cap}>{caption}</div>
    </div>
  );
}

/** Height and radius come from the platform layer: switch Sistema in the
 *  toolbar and every control here reshapes from the same rule. */
export const Buttons: StoryObj = {
  render: () => (
    <div style={row}>
      <Unit caption="Primary"><Button>Adicionar</Button></Unit>
      <Unit caption="Secondary"><Button variant="secondary">Carregar mais</Button></Unit>
      <Unit caption="Ghost"><Button variant="ghost">Cancelar</Button></Unit>
      <Unit caption="Destructive"><Button variant="danger">Remover</Button></Unit>
      <Unit caption="Disabled"><Button disabled>Salvar</Button></Unit>
      <Unit caption="With icon"><Button><PlusIcon />Adicionar</Button></Unit>
      <Unit caption="Icon only"><IconButton label="Mais opções"><MoreIcon /></IconButton></Unit>
    </div>
  )
};

export const SegmentedControl: StoryObj = {
  render: function Render() {
    const [tab, setTab] = useState<"favorites" | "explore">("favorites");
    return (
      <SegmentedRoot value={tab} onChange={setTab}>
        <Segmented
          aria-label="Seção"
          options={[
            { value: "favorites", label: "Favoritos" },
            { value: "explore", label: "Explorar" }
          ]}
        />
      </SegmentedRoot>
    );
  }
};

export const Fields: StoryObj = {
  render: (_args, { globals }) => (
    <div style={row}>
      <Unit caption="Search · rest">
        <SearchField
          style={{ width: 260 }}
          placeholder="Procurar um som…"
          shortcut={findShortcutLabel(globals.os ?? "mac")}
        />
      </Unit>
      <Unit caption="Search · with query">
        <SearchField style={{ width: 260 }} defaultValue="bruxa" />
      </Unit>
      <Unit caption="Text">
        <Field label="Nome" defaultValue="Risada do Ronaldinho" style={{ width: 240 }} />
      </Unit>
      <Unit caption="Text · invalid">
        <Field label="Link" defaultValue="nao-e-um-link" error="Link inválido" style={{ width: 240 }} />
      </Unit>
    </div>
  )
};

export const Status: StoryObj = {
  render: function Render() {
    const [on, setOn] = useState(true);
    const [keep, setKeep] = useState<"merge" | "replace">("merge");
    return (
      <div style={row}>
        <Unit caption="Server · responding"><ServerChip address="localhost:9001" healthy botStatus={{ connected: true, guildName: "Peace Breakers", channelName: "geral" }} /></Unit>
        <Unit caption="Server · bot not in voice"><ServerChip address="localhost:9001" healthy botStatus={{ connected: false }} /></Unit>
        <Unit caption="Server · silent"><ServerChip address="192.168.0.31:9001" healthy={false} /></Unit>
        <Unit caption="Switch"><Switch label="Instants" checked={on} onCheckedChange={setOn} /></Unit>
        <Unit caption="Radio">
          <RadioGroup
            aria-label="E os que você já tem?"
            value={keep}
            onChange={setKeep}
            options={[
              { value: "merge", label: "Manter os meus" },
              { value: "replace", label: "Substituir tudo" }
            ]}
          />
        </Unit>
      </div>
    );
  }
};
