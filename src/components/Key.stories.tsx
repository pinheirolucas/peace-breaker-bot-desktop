import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";
import { comboParts, shiftPart, shortcutParts } from "../hooks/usePlatform";
import type { PlatformId } from "../themes";
import { Key, Keys } from "./Key";

const meta: Meta<typeof Key> = { title: "Components/Tecla", component: Key };
export default meta;
type Story = StoryObj<typeof Key>;

const platformOf = (os: unknown): PlatformId => (os === "win" || os === "linux" ? os : "mac");

const stack: CSSProperties = { display: "grid", gap: 20, padding: 4 };
const line: CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{title}</h3>
      {note && <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", maxWidth: 620, lineHeight: 1.45 }}>{note}</p>}
      {children}
    </section>
  );
}

/** A ground each modifier is meant for. */
function Ground({ label, className, style, children }: { label: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={className} style={{ ...line, padding: "10px 14px", borderRadius: 10, ...style }}>
      <span style={{ width: 96, fontSize: 11, opacity: 0.7 }}>{label}</span>
      {children}
    </div>
  );
}

export const Padrao: Story = { args: { children: "K" } };

/** Every modifier of `.k`, each on the ground it exists for. */
export const Modificadores: Story = {
  name: "Modificadores",
  render: () => (
    <div style={stack}>
      <Section title="Sobre o fundo da janela" note="A base é um traço de 1px sem preenchimento; quiet baixa para muted e a cor da linha.">
        <Ground label="padrão">
          <Key>K</Key>
          <Key>↵</Key>
          <Key>Esc</Key>
        </Ground>
        <Ground label="quiet">
          <Key quiet>K</Key>
          <Key quiet>esc</Key>
        </Ground>
        <Ground label="empty">
          <Key empty>+</Key>
          <Key quiet empty>K</Key>
        </Ground>
        <Ground label="pressed">
          <Key pressed>K</Key>
        </Ground>
        <Ground label="rec">
          <Key rec>K</Key>
          <Key rec>···</Key>
        </Ground>
        <Ground label="disabled">
          <Key disabled>K</Key>
          <Key quiet disabled>K</Key>
        </Ground>
      </Section>

      <Section title="Sobre a cor de destaque" note="A linha selecionada da paleta e do menu, e o botão Parar do acesso rápido em uso.">
        <Ground label="onAccent" style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
          <Key onAccent>↵</Key>
          <Key quiet onAccent>esc</Key>
        </Ground>
      </Section>

      <Section title="Sobre o fundo invertido" note="Dicas de ferramenta.">
        <Ground label="inv" style={{ background: "var(--fg)", color: "var(--bg)" }}>
          <Key inv>⌘</Key>
          <Key inv>F</Key>
        </Ground>
      </Section>

      <Section title="No cartão" note="A tecla de um som usa a tinta do cartão. Vazia, o espaço tracejado do Organizar; pressed, a tecla apertada.">
        {(["p0", "p1", "p2", "p3", "p4", "p5"] as const).map((slot) => (
          <Ground key={slot} label={slot} className={slot} style={{ background: "var(--fill)", color: "var(--ink)" }}>
            <Key card>A</Key>
            <Key card empty />
            <Key card pressed>A</Key>
            <Key card>↵</Key>
          </Ground>
        ))}
      </Section>
    </div>
  )
};

/** One cap per physical key, side by side, the gap doing the separating. */
export const Combinacoes: Story = {
  name: "Combinações",
  render: (_args, { globals }) => {
    const os = platformOf(globals.os);
    return (
      <div style={stack}>
        <Section
          title="O padrão"
          note="Uma Key por tecla física e nada mais dentro dela: sem espaço, sem “+”, sem vírgula juntando teclas. Os modificadores vêm primeiro, em glifos no macOS e em palavras nos outros sistemas."
        >
          <div style={line}>
            <Keys parts={shortcutParts(os, "k")} />
            <Keys parts={shortcutParts(os, ",")} />
            <Keys parts={[shiftPart(os), "A"]} />
            <Keys parts={comboParts(os, os === "mac" ? "ctrl-alt" : "ctrl-alt-shift", "v")} />
            <Keys parts={["?"]} />
            <Keys parts={["Esc"]} />
          </div>
        </Section>

        <Section title="Os três sistemas, lado a lado" note="Independente do botão Sistema da barra: o mesmo combo global em cada um.">
          {(["mac", "win", "linux"] as const).map((system) => (
            <div key={system} style={line}>
              <span style={{ width: 60, fontSize: 12, color: "var(--muted)" }}>{system}</span>
              <Keys parts={comboParts(system, system === "mac" ? "ctrl-alt" : "ctrl-alt-shift", "v")} />
              <Keys quiet parts={shortcutParts(system, "N")} />
              <Keys quiet parts={[shiftPart(system), "↵"]} />
            </div>
          ))}
        </Section>

        <Section title="A ordem dos modificadores" note="⌃ ⌥ ⇧ ⌘ no macOS; Ctrl Alt Shift nos demais, com Super por último, como o ⌘.">
          <div style={line}>
            <Keys quiet parts={comboParts("mac", "cmd-alt", "v")} />
            <Keys quiet parts={comboParts("mac", "ctrl-shift", "v")} />
            <Keys quiet parts={comboParts("win", "ctrl-shift", "v")} />
            <Keys quiet parts={comboParts("linux", "super-alt", "v")} />
          </div>
        </Section>

        <Section title="Uma faixa" note="Duas teclas em volta de um “…” em muted, fora de qualquer Key.">
          <div style={{ ...line, gap: 3 }}>
            <Key>A</Key>
            <span style={{ color: "var(--muted)", padding: "0 3px" }}>…</span>
            <Key>Z</Key>
          </div>
        </Section>

        <Section title="A tecla da vírgula" note="Uma vírgula sozinha é uma tecla; junto de outra coisa, seriam duas Keys.">
          <div style={line}>
            <Keys parts={shortcutParts(os, ",")} />
            <Key>,</Key>
          </div>
        </Section>
      </div>
    );
  }
};

/** The screen-reader side: one label on the group, the caps hidden. */
export const Acessibilidade: Story = {
  name: "Leitura em voz alta",
  render: () => (
    <div style={stack}>
      <Section title="Um rótulo por combo" note='O grupo diz “Shift + ,”; as teclas dentro ficam aria-hidden. Os glifos têm nomes: ⌘ Command, ⌥ Option, ⇧ Shift, ⌃ Control, ↵ Enter.'>
        <div style={line}>
          <Keys parts={["⇧", ","]} />
          <Keys parts={["⌘", "K"]} label="Command K" />
        </div>
      </Section>
    </div>
  )
};
