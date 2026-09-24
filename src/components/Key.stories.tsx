import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { Key } from "./Key";

const meta: Meta<typeof Key> = { title: "Primitivos/Tecla", component: Key };
export default meta;
type Story = StoryObj<typeof Key>;

const row: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: 12 };

export const Padrao: Story = { args: { children: "K" } };

export const Todas: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={row}>
        <Key>⌘</Key>
        <Key>K</Key>
        <Key quiet>⌘F</Key>
        <Key empty />
        <Key pressed>A</Key>
        <Key rec>…</Key>
        <Key dis>Esc</Key>
      </div>
      <div className="p0" style={{ ...row, background: "var(--fill)", color: "var(--ink)" }}>
        <Key card>V</Key>
        <Key card empty />
        <Key card pressed>V</Key>
      </div>
      <div style={{ ...row, background: "var(--accent)", color: "var(--onAccent)" }}>
        <Key onAccent>↵</Key>
        <Key quiet onAccent>esc</Key>
      </div>
      <div style={{ ...row, background: "var(--fg)", color: "var(--bg)" }}>
        <Key inv quiet>⌘</Key>
        <Key inv>K</Key>
      </div>
    </div>
  )
};
