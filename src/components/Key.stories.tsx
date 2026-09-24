import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";
import { Key, Keys } from "./Key";

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
      <Ground>
        <Keys parts={["⌘", "K"]} />
        <Keys quiet parts={["⌃", "⌥", "⇧", "V"]} />
        <Keys quiet parts={["Ctrl", "Alt", "Shift", "V"]} />
        <Keys quiet parts={["Shift", ","]} />
        <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
          <Key>A</Key>
          <span style={{ color: "var(--muted)" }}>…</span>
          <Key>Z</Key>
        </span>
      </Ground>
      <Ground style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
        <Keys onAccent parts={["↵"]} />
        <Keys quiet onAccent parts={["⇧", "↵"]} />
      </Ground>
      <Ground style={{ background: "var(--fg)", color: "var(--bg)" }}>
        Buscar <Keys inv parts={["⌘", "F"]} />
      </Ground>
      <Ground className="p0" style={{ background: "var(--fill)", color: "var(--ink)" }}>
        <Key card>A</Key>
        <Key card empty />
        <Key card pressed>A</Key>
      </Ground>
    </div>
  )
};
