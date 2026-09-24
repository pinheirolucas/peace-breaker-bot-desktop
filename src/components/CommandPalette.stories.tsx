import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { THEMES } from "../themes";
import type { ThemeId } from "../themes";
import type { PaletteCandidates, PaletteItem, PalettePreview } from "../lib/palette";
import { slotFor } from "../lib/slot";
import CommandPalette from "./CommandPalette";
import type { PaletteStatus } from "./CommandPalette";

const meta: Meta = { title: "Paleta de comandos/Janela" };
export default meta;

// The palette is a modal dialog, so each story frames it in a window-sized box
// (a transformed ancestor is the containing block of its fixed layers) behind a
// stand-in for the app. The Tema x Modo x Sistema (and Desktop) toolbar decides
// the palette and the dialect of the selected row: a filled pill on macOS, a soft
// ground with a 3px bar on Windows and KDE, the soft ground alone on GNOME.

const noop = () => undefined;
const mod = (os: unknown) => (os === "mac" ? "⌘" : "Ctrl");

const clips = [
  { name: "Vine boom", url: "https://x/1", key: "v" },
  { name: "Airhorn", url: "https://x/2", key: "a" },
  { name: "Bonk", url: "https://x/3", key: "k" },
  { name: "Bom dia", url: "https://x/4" },
  { name: "Sad trombone", url: "https://x/5", key: "s" },
  { name: "Windows XP shutdown", url: "https://x/6" }
];

interface Scenario {
  away?: boolean;
  playing?: boolean;
  organizing?: boolean;
  noServer?: boolean;
  os: unknown;
}

const item = (id: string, title: string, patch: Partial<PaletteItem> = {}): PaletteItem => ({ id, kind: "action", title, run: noop, ...patch });

function candidates({ away, playing, organizing, noServer, os }: Scenario, current: { theme: ThemeId; mode: string }): PaletteCandidates {
  const sound = (clip: (typeof clips)[number]) =>
    item(`s:${clip.url}`, clip.name, {
      kind: "sound",
      glyph: clip.key,
      slot: slotFor(clip.url),
      sub: clip.key ? undefined : "sem tecla",
      tag: away ? "só aqui" : undefined,
      tagTone: away ? "warn" : undefined,
      dim: away || playing,
      refused: away
    });

  const modes = [
    ["auto", "Automático"],
    ["light", "Claro"],
    ["dark", "Escuro"]
  ] as const;
  const sections = ["Geral", "Aparência", "Servidor", "Explorar", "Atalhos", os === "mac" ? "Barra de menus" : "Bandeja", "Dados e backup"];
  const sectionSubs = [
    "Idioma e atualizações",
    "Paleta e modo claro ou escuro",
    "Servidor ativo, procurar de novo, endereço",
    "Site e país do catálogo",
    "Teclas globais, acesso rápido, lista de atalhos",
    "Ícone, acesso rápido, continuar rodando",
    "Exportar, importar, restaurar"
  ];

  return {
    recents: organizing ? [] : clips.slice(0, 3).map(sound),
    sounds: organizing ? [] : clips.map(sound),
    playing: playing
      ? item("stop", "Parar o som", { kind: "stop", icon: "stop", sub: "Tocando: Vine boom", keys: ["esc"], tag: "Tocando", keywords: "parar" })
      : undefined,
    explore: (query) => item("explore", `Buscar “${query}” em MyInstants`, { kind: "explore", icon: "compass", sub: "Explorar · leva o texto junto" }),
    actions: [
      ...(organizing ? [item("done", "Concluir Organizar", { icon: "check", sub: "Sons ficam de fora até lá" })] : [item("add", "Adicionar um som", { icon: "plus", sub: "Favoritos", keys: [mod(os), "N"], keywords: "novo favorito" })]),
      ...(organizing ? [] : [item("organize", "Organizar favoritos", { icon: "reorder", sub: "Arraste para reordenar", keywords: "ordenar teclas" })]),
      item("explore-tab", "Ir para Explorar", { icon: "compass", sub: "Aba", keys: [mod(os), "2"], keywords: "catalogo" }),
      item("settings", "Abrir Configurações", { icon: "sliders", sub: "Última seção aberta", keys: [mod(os), ","] }),
      item("find", "Focar a busca", { icon: "search", keys: [mod(os), "F"] }),
      item("import", "Importar favoritos", { icon: "upload", sub: "Dados e backup" }),
      item("sheet", "Atalhos do teclado", { icon: "keyboard", keys: ["?"] })
    ],
    defaultActions: 4,
    settings: [
      ...sections.map((name, index) => item(`section:${index}`, `Configurações › ${name}`, { icon: "sliders", sub: sectionSubs[index], tag: "Configurações", keywords: name })),
      item("palette", "Paleta", { kind: "drill", icon: "palette", sub: "Aparência · prévia ao vivo", keywords: "tema cores" }),
      ...modes.map(([id, label]) => item(`mode:${id}`, `Modo: ${label}`, { kind: "setting", icon: "moon", sub: "Aparência", keywords: "modo escuro claro tema", current: current.mode === id, preview: { mode: id } })),
      item("lang:en", "Idioma: English", { kind: "setting", icon: "globe", sub: "Geral", keywords: "language" }),
      item("site:instants", "Site do Explorar: InstantsMeme", { kind: "setting", icon: "compass", sub: "Explorar" }),
      item("global", "Ligar teclas globais", { kind: "setting", icon: "keyboard", sub: "Atalhos", keywords: "teclas globais" })
    ],
    servers: noServer
      ? [item("rescan", "Procurar servidores de novo", { kind: "setting", icon: "refresh", sub: "Servidor" })]
      : [
          item("srv:a", "Servidor: 192.168.0.12:9001", { kind: "setting", icon: "server", sub: "este computador", current: true, keywords: "servidor trocar" }),
          item("srv:b", "Servidor: 192.168.0.34:9001", { kind: "setting", icon: "server", sub: "na rede", keywords: "servidor trocar" }),
          item("rescan", "Procurar servidores de novo", { kind: "setting", icon: "refresh", sub: "Servidor" })
        ]
  };
}

function status(s: Scenario): PaletteStatus {
  return s.noServer ? { tone: "warn", text: "Nenhum servidor encontrado" } : s.away ? { tone: "warn", text: "bot fora de um canal de voz" } : { tone: "ok", text: "Casa · #geral" };
}

/** Stands in for the main window behind the palette, on the same tokens, so a preview repaints something real. */
function AppBackdrop({ width, height }: { width: number; height: number }) {
  return (
    <div style={{ width, height, background: "var(--bg)", color: "var(--fg)", padding: 16, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <span style={{ padding: "5px 15px", borderRadius: "var(--rctl)", background: "var(--accent)", color: "var(--onAccent)", fontWeight: 650 }}>Favoritos</span>
        <span style={{ padding: "5px 15px", color: "var(--muted)", fontWeight: 650 }}>Explorar</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {clips.concat(clips).map((clip, index) => (
          <div key={index} className={slotFor(clip.url + index)} style={{ height: 76, borderRadius: "var(--rpad)", background: "var(--fill)", color: "var(--ink)", padding: 10, fontWeight: 650, fontSize: 13 }}>
            {clip.name}
          </div>
        ))}
      </div>
    </div>
  );
}

interface FrameProps {
  width?: number;
  height?: number;
  scenario: Scenario;
  initialQuery?: string;
  initialView?: "root" | "themes";
  /** Show the palette repainting the frame, as the app does: the preview stamps <html> and is dropped on the way out. */
  livePreview?: boolean;
  caption?: ReactNode;
}

function Frame({ width = 900, height = 620, scenario, initialQuery, initialView, livePreview, caption }: FrameProps) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<{ theme: ThemeId; mode: string }>(() => ({
    theme: (document.documentElement.dataset.theme as ThemeId) ?? "esmalte",
    mode: document.documentElement.dataset.mode ?? "dark"
  }));

  const [baseline] = useState(saved);
  useEffect(
    () => () => {
      document.documentElement.dataset.theme = baseline.theme;
      document.documentElement.dataset.mode = baseline.mode;
    },
    [baseline]
  );

  const themes = useMemo(
    () =>
      THEMES.map((theme) =>
        item(`theme:${theme.id}`, theme.name, {
          kind: "setting",
          sub: theme.desc,
          swatch: theme.id,
          current: saved.theme === theme.id,
          preview: { theme: theme.id },
          run: () => setSaved((current) => ({ ...current, theme: theme.id }))
        })
      ),
    [saved.theme]
  );

  const onPreview = (preview: PalettePreview | null) => {
    if (!livePreview) return;
    const root = document.documentElement;
    root.dataset.theme = preview?.theme ?? saved.theme;
    root.dataset.mode = preview?.mode && preview.mode !== "auto" ? preview.mode : saved.mode;
  };

  return (
    <figure style={{ margin: 0 }}>
      <div
        ref={setBox}
        style={{ position: "relative", width, height, transform: "translateZ(0)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}
      >
        <AppBackdrop width={width} height={height} />
        {box && (
          <CommandPalette
            open={open}
            onOpenChange={setOpen}
            container={box}
            candidates={candidates(scenario, saved)}
            themes={themes}
            onPreview={onPreview}
            status={status(scenario)}
            initialQuery={initialQuery}
            initialView={initialView}
          />
        )}
        {!open && (
          <button type="button" onClick={() => setOpen(true)} style={{ position: "absolute", top: 16, right: 16 }}>
            Abrir a paleta ({mod(scenario.os)}+K)
          </button>
        )}
      </div>
      {caption && <figcaption style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", maxWidth: width }}>{caption}</figcaption>}
    </figure>
  );
}

const story = (name: string, props: Omit<FrameProps, "scenario"> & { scenario?: Omit<Scenario, "os"> }): StoryObj => ({
  name,
  render: (_args, { globals }) => <Frame {...props} scenario={{ ...props.scenario, os: globals.os }} />
});

// ---- closed and open ----

/** Closed: only the app. The palette opens from any tab with the shortcut, or here with the button. */
export const Closed: StoryObj = {
  name: "Fechada",
  render: function Render(_args, { globals }) {
    const [open, setOpen] = useState(false);

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <AppBackdrop width={900} height={300} />
        <button type="button" style={{ width: "fit-content" }} onClick={() => setOpen(true)}>
          Abrir a paleta ({mod(globals.os)}+K)
        </button>
        {open && <Frame height={560} scenario={{ os: globals.os }} caption="Aberta a partir da janela acima." />}
      </div>
    );
  }
};

export const Open = story("Aberta, sem texto", {});

// ---- states ----

export const Typing = story("Digitando · sons e Explorar", { initialQuery: "bo" });
export const NoMatch = story("Sem resultado", { initialQuery: "xyzzy" });

// ---- one group each ----

export const GroupPlaying = story("Grupo · Tocando agora", { scenario: { playing: true } });
export const GroupSounds = story("Grupo · Sons", { initialQuery: "b" });
export const GroupActions = story("Grupo · Ações", { initialQuery: ">a" });
export const GroupSettings = story("Grupo · Configurações (uma linha por seção)", { initialQuery: ">configurações ›" });
export const GroupServers = story("Grupo · Servidor", { initialQuery: "servidor" });
export const CommandsOnly = story("Modo > · só ações e configurações", { initialQuery: ">" });

// ---- states of the bot, organizing and the server ----

export const BotAway = story("Bot fora do canal · Enter apagado", { initialQuery: "bo", scenario: { away: true } });
export const Organizing = story("Organizar ligado · sons de fora", { scenario: { organizing: true } });
export const NoServer = story("Sem servidor", { initialQuery: "servidor", scenario: { noServer: true } });

// ---- inline actions ----

export const PaletteList = story(
  "Paleta · lista das oito, com prévia ao vivo",
  {
    initialView: "themes",
    livePreview: true,
    caption: "Cada seta repinta o app atrás; nada é salvo até Enter. Esc desfaz e volta; Backspace num campo vazio também."
  }
);

export const ModeLivePreview = story(
  "Modo · prévia ao vivo",
  {
    initialQuery: ">modo",
    livePreview: true,
    caption: "Ao destacar Modo: Claro ou Escuro o app atrás repinta; Enter salva, qualquer outra saída desfaz."
  }
);

export const InlineSettings = story("Idioma, site e teclas globais · aplicam com Enter", { initialQuery: ">idioma" });

// ---- the narrow window ----

export const Compact = story(
  "Janela estreita · 420 px",
  {
    width: 420,
    height: 620,
    initialQuery: "bo",
    caption: "A paleta ocupa a largura da janela menos 16px de cada lado; as dicas do rodapé encolhem para a primeira e a última."
  }
);
