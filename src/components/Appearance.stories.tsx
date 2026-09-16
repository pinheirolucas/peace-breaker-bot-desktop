import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TrashIcon } from "../icons";
import type { Instant } from "../storage";
import { THEMES, isThemeId } from "../themes";
import type { ColorMode, ResolvedMode, ThemeId } from "../themes";
import { AppearanceDock } from "./AppearanceDock";
import { AppearanceStage } from "./AppearanceStage";
import { Button } from "./Button";
import InstantCard from "./InstantCard";
import { SegmentedChoice } from "./Segmented";
import { ThemePicker } from "./ThemePicker";
import { ThemeSwatch } from "./ThemeSwatch";
import "../styles/shell.css";

const meta: Meta = { title: "Components/Aparência" };
export default meta;

const MODES: { value: ColorMode; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" }
];

/** The toolbar's Modo stands in for the OS: it is what "auto" resolves to. */
function osMode(globals: Record<string, unknown>): ResolvedMode {
  return globals.mode === "light" ? "light" : "dark";
}

/** Each swatch themes itself, so all eight hold whatever Tema the toolbar is
 *  on — the nesting that tokens.css's per-element slot fills make possible. */
export const Swatches: StoryObj = {
  name: "ThemeSwatch · all eight",
  render: (_args, { globals }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 150px)", gap: "20px 18px" }}>
      {THEMES.map((theme) => (
        <div key={theme.id} style={{ display: "grid", gap: 6 }}>
          <ThemeSwatch theme={theme.id} mode={osMode(globals)} />
          <span style={{ fontSize: 12.5, fontWeight: 650 }}>{theme.name}</span>
          <span style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.35 }}>{theme.desc}</span>
        </div>
      ))}
    </div>
  )
};

/** Click, or focus one and use the arrow keys. Picking here only moves the
 *  selection; the Shell story is where a pick repaints the app. */
export const Picker: StoryObj = {
  name: "ThemePicker · the filmstrip",
  render: function Render(_args, { globals }) {
    const [theme, setTheme] = useState<ThemeId>("esmalte");
    return (
      <div style={{ maxWidth: 1100 }}>
        <ThemePicker value={theme} onChange={setTheme} mode={osMode(globals)} />
      </div>
    );
  }
};

export const ModeChoice: StoryObj = {
  name: "SegmentedChoice · colour mode",
  render: function Render() {
    const [mode, setMode] = useState<ColorMode>("auto");
    return <SegmentedChoice aria-label="Modo" value={mode} onChange={setMode} options={MODES} />;
  }
};

const DEMO: Instant[] = [
  "Risada do Ronaldinho", "Bruxaria", "Vish", "Que isso, meu filho",
  "Cavalo!", "Tá pegando fogo, bicho", "Faustão: errou!", "Rapaaaz"
].map((name, i) => ({ name, url: `https://www.myinstants.com/pt/instant/demo-${i}/` }));

const noop = () => {};

function DemoApp() {
  return (
    <>
      <header className="hero">
        <h1>Favoritos</h1>
        <span className="count">{DEMO.length} sons salvos</span>
      </header>
      <main className="scroll">
        <div className="grid">
          {DEMO.map((instant) => (
            <InstantCard
              key={instant.url}
              instant={instant}
              playback="idle"
              otherPlaying={false}
              botStatus={null}
              onPlay={noop}
              onPlayOnDiscord={noop}
              onStop={noop}
              trail={{ label: "Remover", icon: <TrashIcon />, onClick: noop }}
            />
          ))}
        </div>
      </main>
    </>
  );
}

/** The whole shell, as App wires it: picks repaint the staged app live,
 *  Pronto keeps them, Cancelar or Escape put back what was there. Themed as
 *  a subtree — the dock renders in place rather than through a portal, so
 *  it follows the subtree too. */
export const Shell: StoryObj = {
  name: "Shell · stage and dock",
  render: function Render(_args, { globals }) {
    const start: ThemeId = isThemeId(globals.theme) ? globals.theme : "esmalte";
    const [saved, setSaved] = useState<{ theme: ThemeId; mode: ColorMode }>({ theme: start, mode: "auto" });
    const [draft, setDraft] = useState(saved);
    const [open, setOpen] = useState(true);

    const shown = open ? draft : saved;
    const resolved = shown.mode === "auto" ? osMode(globals) : shown.mode;

    return (
      <div
        data-theme={shown.theme}
        data-mode={resolved}
        style={{
          height: "calc(100vh - 56px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "var(--bg)",
          color: "var(--fg)"
        }}
      >
        <AppearanceStage open={open}>
          <DemoApp />
        </AppearanceStage>
        {open ? (
          <AppearanceDock
            theme={draft.theme}
            mode={draft.mode}
            resolved={resolved}
            onThemeChange={(theme) => setDraft((current) => ({ ...current, theme }))}
            onModeChange={(mode) => setDraft((current) => ({ ...current, mode }))}
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              setSaved(draft);
              setOpen(false);
            }}
          />
        ) : (
          <div style={{ padding: 16, borderTop: "1px solid var(--line)" }}>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(saved);
                setOpen(true);
              }}
            >
              Aparência
            </Button>
          </div>
        )}
      </div>
    );
  }
};
