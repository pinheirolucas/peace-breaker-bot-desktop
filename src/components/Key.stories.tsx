import type { Meta, StoryObj } from "@storybook/react-vite";
import { Key } from "./Key";
import type { KeyProps } from "./Key";

const meta: Meta<typeof Key> = { title: "Componentes/Key", component: Key };
export default meta;

type Story = StoryObj<typeof Key>;

const row = { display: "flex", gap: 12, alignItems: "center", padding: 12 } as const;

export const Variantes: Story = {
  render: () => {
    const cases: [string, KeyProps, string?][] = [
      ["padrão", {}],
      ["quiet", { quiet: true }],
      ["empty", { empty: true }],
      ["pressed", { pressed: true }],
      ["rec", { rec: true }],
      ["dis", { dis: true }]
    ];
    return (
      <div>
        <div style={row}>
          {cases.map(([name, props]) => (
            <Key key={name} {...props}>
              {name === "empty" ? "" : "K"}
            </Key>
          ))}
        </div>
        <div style={row} className="p0">
          <div style={{ background: "var(--fill)", color: "var(--ink)", padding: 12, borderRadius: 10, display: "flex", gap: 8 }}>
            <Key card>V</Key>
            <Key card empty />
            <Key card pressed>V</Key>
          </div>
        </div>
        <div style={{ ...row, background: "var(--accent)", color: "var(--onAccent)" }}>
          <Key onAccent>↵</Key>
          <Key quiet onAccent>esc</Key>
        </div>
        <div style={{ ...row, background: "var(--fg)", color: "var(--bg)" }}>
          <Key inv>⌘K</Key>
        </div>
      </div>
    );
  }
};
