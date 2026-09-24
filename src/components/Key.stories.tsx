import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";
import { Key } from "./Key";

const meta: Meta<typeof Key> = { title: "Components/Tecla", component: Key };
export default meta;
type Story = StoryObj<typeof Key>;

const row = { display: "flex", gap: 8, alignItems: "center", padding: 12, borderRadius: 10 } as const;

function Ground({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={{ ...row, ...style }}>
      {children}
    </div>
  );
}

export const Padrao: Story = { args: { children: "K" } };

export const Variantes: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12, color: "var(--fg)", background: "var(--bg)", padding: 16 }}>
      <Ground>
        <Key>⌘</Key>
        <Key>K</Key>
        <Key quiet>⌘F</Key>
        <Key empty>+</Key>
        <Key pressed>V</Key>
        <Key rec>V</Key>
        <Key disabled>V</Key>
      </Ground>
      <Ground style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
        <Key onAccent>↵</Key>
        <Key quiet onAccent>esc</Key>
      </Ground>
      <Ground style={{ background: "var(--fg)", color: "var(--bg)" }}>
        Buscar <Key inv>⌘F</Key>
      </Ground>
      <Ground className="p0" style={{ background: "var(--fill)", color: "var(--ink)" }}>
        <Key card>A</Key>
        <Key card empty />
        <Key card pressed>A</Key>
      </Ground>
    </div>
  )
};
